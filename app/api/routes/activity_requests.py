import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies.auth import get_current_user
from app.db.dependencies import get_db
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_request import (
    ActivityRequestCoordinatorResponse,
    ActivityRequestResponse,
)
from app.schemas.activity_review import ActivityReviewRequest, ActivityReviewResponse
from app.schemas.pagination import PaginatedResponse
from app.services.activity_request_action_service import (
    ActivityRequestActionError,
    ActivityRequestActionService,
)
from app.services.activity_request_query_service import ActivityRequestQueryService
from app.services.activity_review_service import ActivityReviewError, ActivityReviewService
from app.services.hours_service import HoursService
from app.services.storage import (
    InvalidFileError,
    MinioStorageService,
    StorageError,
    get_storage_service,
)

router = APIRouter(prefix="/activity-requests", tags=["activity-requests"])


@router.get("/me", response_model=PaginatedResponse[ActivityRequestResponse])
def list_my_activity_requests(
    status_filter: ActivityRequestStatus | None = Query(default=None, alias="status"),
    activity_type_id: uuid.UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ActivityRequestResponse]:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem acessar suas próprias solicitações.",
        )

    query_service = ActivityRequestQueryService(db)

    student = query_service.get_student_by_user_id(db, current_user.id)

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de aluno não encontrado.",
        )

    items, total = query_service.list_by_student(
        student_id=student.id,
        status=status_filter,
        activity_type_id=activity_type_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=query_service.calculate_total_pages(total, page_size),
    )


@router.get(
    "/coordinator",
    response_model=PaginatedResponse[ActivityRequestCoordinatorResponse],
)
def list_coordinator_activity_requests(
    status_filter: ActivityRequestStatus | None = Query(default=None, alias="status"),
    activity_type_id: uuid.UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    search: str | None = Query(
        default=None,
        description="Busca por nome ou matrícula do aluno",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ActivityRequestCoordinatorResponse]:
    if current_user.role != UserRole.COORDINATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas coordenadores podem acessar esta listagem.",
        )

    course = db.scalar(
        select(Course).where(Course.coordinator_id == current_user.id)
    )

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum curso vinculado a este coordenador.",
        )

    query_service = ActivityRequestQueryService(db)

    items, total = query_service.list_by_coordinator_course(
        course_id=course.id,
        status=status_filter,
        activity_type_id=activity_type_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        page=page,
        page_size=page_size,
    )

    response_items = [
        ActivityRequestCoordinatorResponse(
            **ActivityRequestResponse.model_validate(item).model_dump(),
            student_name=item.student.name,
            student_registration_number=item.student.registration_number,
        )
        for item in items
    ]

    return PaginatedResponse(
        items=response_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=query_service.calculate_total_pages(total, page_size),
    )


@router.post("", response_model=ActivityRequestResponse, status_code=status.HTTP_201_CREATED)
def create_activity_request(
    activity_type_id: uuid.UUID = Form(...),
    title: str = Form(...),
    requested_hours: int = Form(...),
    location: str = Form(...),
    activity_date: date = Form(...),
    description: str | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage_service: MinioStorageService = Depends(get_storage_service),
) -> ActivityRequest:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem criar solicitações de atividade.",
        )

    if requested_hours <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A quantidade de horas deve ser maior que zero.",
        )

    student = db.scalar(
        select(Student).where(Student.user_id == current_user.id)
    )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de aluno não encontrado.",
        )

    course = db.scalar(
        select(Course).where(Course.id == student.course_id)
    )

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso do aluno não encontrado.",
        )

    hours_service = HoursService(db)
    if hours_service.has_reached_course_limit(student.id, course):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Você já atingiu o limite de horas complementares do curso "
                f"({course.total_required_hours}h + {course.max_extra_hours}h de tolerância). "
                "Novas solicitações não são permitidas."
            ),
        )

    activity_type = db.scalar(
        select(ActivityType).where(
            ActivityType.id == activity_type_id,
            ActivityType.course_id == student.course_id,
            ActivityType.is_active.is_(True),
        )
    )

    if not activity_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tipo de atividade não encontrado para o curso do aluno.",
        )

    try:
        file_url = storage_service.upload_certificate(
            file=file,
            student_id=student.id,
        )
    except InvalidFileError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    activity_request = ActivityRequest(
        student_id=student.id,
        activity_type_id=activity_type.id,
        title=title,
        description=description,
        location=location,
        activity_date=activity_date,
        requested_hours=requested_hours,
        accepted_hours=None,
        status=ActivityRequestStatus.PENDING,
    )

    db.add(activity_request)
    db.flush()

    attachment = ActivityAttachment(
        activity_request_id=activity_request.id,
        file_name=file.filename or "certificate",
        file_url=file_url,
        content_type=file.content_type,
        size_bytes=file.size,
    )

    db.add(attachment)
    db.commit()

    created_request = db.scalar(
        select(ActivityRequest)
        .options(selectinload(ActivityRequest.attachments))
        .where(ActivityRequest.id == activity_request.id)
    )

    if not created_request:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao buscar solicitação criada.",
        )

    return created_request


@router.patch("/{activity_request_id}/cancel", response_model=ActivityRequestResponse)
def cancel_activity_request(
    activity_request_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityRequest:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem cancelar suas próprias solicitações.",
        )

    service = ActivityRequestActionService(db)

    try:
        return service.cancel(
            activity_request_id=activity_request_id,
            user_id=current_user.id,
        )
    except ActivityRequestActionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{activity_request_id}/review",
    response_model=ActivityReviewResponse,
)
def review_activity_request(
    activity_request_id: uuid.UUID,
    payload: ActivityReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityRequest:
    service = ActivityReviewService(db)

    try:
        return service.review(
            activity_request_id=activity_request_id,
            current_user=current_user,
            status=payload.status,
            accepted_hours=payload.accepted_hours,
            rejection_reason=payload.rejection_reason,
        )
    except ActivityReviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc