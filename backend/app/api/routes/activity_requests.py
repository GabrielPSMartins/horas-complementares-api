import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import StringConstraints
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies.auth import get_current_user, require_roles
from app.api.dependencies.profiles import get_coordinator_course, get_current_student
from app.api.responses import error_responses
from app.core.exceptions import NotFoundError
from app.db.dependencies import get_db
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_request_history import ActivityRequestHistory
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_request import (
    ActivityAttachmentDownloadResponse,
    ActivityRequestCoordinatorResponse,
    ActivityRequestResponse,
)
from app.schemas.activity_request_history import ActivityRequestHistoryResponse
from app.schemas.activity_review import ActivityReviewRequest, ActivityReviewResponse
from app.schemas.pagination import PaginatedResponse
from app.services.activity_request_action_service import ActivityRequestActionService
from app.services.activity_request_creation_service import ActivityRequestCreationService
from app.services.activity_request_query_service import ActivityRequestQueryService
from app.services.activity_review_service import ActivityReviewService
from app.services.storage import (
    DOWNLOAD_URL_EXPIRES_SECONDS,
    MinioStorageService,
    get_storage_service,
)

router = APIRouter(
    prefix="/activity-requests",
    tags=["activity-requests"],
    responses=error_responses(401, 403),
)

# Textos do formulário de envio: espaços nas pontas são removidos antes de validar o tamanho.
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=255)]
Location = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=255)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


def _to_coordinator_response(item: ActivityRequest) -> ActivityRequestCoordinatorResponse:
    return ActivityRequestCoordinatorResponse(
        **ActivityRequestResponse.model_validate(item).model_dump(),
        student_name=item.student.full_name,
        student_registration_number=item.student.registration_number,
        student_semester=item.student.current_semester,
    )


@router.get(
    "/me",
    response_model=PaginatedResponse[ActivityRequestResponse],
    summary="Lista as solicitações do aluno logado",
    responses=error_responses(404),
)
def list_my_activity_requests(
    status_filter: ActivityRequestStatus | None = Query(default=None, alias="status"),
    activity_type_id: uuid.UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ActivityRequestResponse]:
    query_service = ActivityRequestQueryService(db)

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
    summary="Lista as solicitações dos alunos do curso do coordenador",
    responses=error_responses(404),
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
    semester: int | None = Query(
        default=None,
        ge=1,
        description="Filtra solicitações por semestre atual do aluno",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    course: Course = Depends(get_coordinator_course),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ActivityRequestCoordinatorResponse]:
    query_service = ActivityRequestQueryService(db)

    items, total = query_service.list_by_coordinator_course(
        course_id=course.id,
        status=status_filter,
        activity_type_id=activity_type_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        semester=semester,
        page=page,
        page_size=page_size,
    )

    return PaginatedResponse(
        items=[_to_coordinator_response(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=query_service.calculate_total_pages(total, page_size),
    )


@router.post(
    "",
    response_model=ActivityRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Envia uma nova solicitação com o certificado (aluno)",
    responses=error_responses(404, 422, 503),
)
def create_activity_request(
    activity_type_id: Annotated[uuid.UUID, Form()],
    title: Annotated[Title, Form()],
    requested_hours: Annotated[int, Form(le=1000)],
    location: Annotated[Location, Form()],
    activity_date: Annotated[date, Form()],
    description: Annotated[Description | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
    storage_service: MinioStorageService = Depends(get_storage_service),
) -> ActivityRequest:
    return ActivityRequestCreationService(db, storage_service).create(
        student=student,
        activity_type_id=activity_type_id,
        title=title,
        requested_hours=requested_hours,
        location=location,
        activity_date=activity_date,
        description=description,
        file=file,
    )


@router.get(
    "/{activity_request_id}",
    response_model=ActivityRequestCoordinatorResponse | ActivityRequestResponse,
    summary="Detalha uma solicitação (dono ou coordenador do curso)",
    responses=error_responses(404),
)
def get_activity_request(
    activity_request_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityRequestCoordinatorResponse | ActivityRequestResponse:
    activity_request = ActivityRequestQueryService(db).get_visible_to(
        activity_request_id,
        current_user,
        selectinload(ActivityRequest.attachments),
        selectinload(ActivityRequest.in_review_by).selectinload(User.coordinator_profile),
        selectinload(ActivityRequest.reviewer).selectinload(User.coordinator_profile),
    )

    if current_user.role == UserRole.COORDINATOR:
        return _to_coordinator_response(activity_request)

    return ActivityRequestResponse.model_validate(activity_request)


@router.get(
    "/{activity_request_id}/history",
    response_model=list[ActivityRequestHistoryResponse],
    summary="Histórico de mudanças de status da solicitação",
    responses=error_responses(404),
)
def get_activity_request_history(
    activity_request_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityRequestHistory]:
    activity_request = ActivityRequestQueryService(db).get_visible_to(
        activity_request_id,
        current_user,
        selectinload(ActivityRequest.history_items)
        .selectinload(ActivityRequestHistory.changed_by)
        .selectinload(User.coordinator_profile),
        selectinload(ActivityRequest.history_items)
        .selectinload(ActivityRequestHistory.changed_by)
        .selectinload(User.student_profile),
    )

    return sorted(
        activity_request.history_items,
        key=lambda item: item.created_at,
    )


@router.get(
    "/{activity_request_id}/attachments/{attachment_id}/download",
    response_model=ActivityAttachmentDownloadResponse,
    summary="Gera um link temporário para baixar o certificado",
    responses=error_responses(404, 503),
)
def get_activity_attachment_download_url(
    activity_request_id: uuid.UUID,
    attachment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage_service: MinioStorageService = Depends(get_storage_service),
) -> ActivityAttachmentDownloadResponse:
    activity_request = ActivityRequestQueryService(db).get_visible_to(
        activity_request_id,
        current_user,
        selectinload(ActivityRequest.attachments),
    )

    attachment = next(
        (item for item in activity_request.attachments if item.id == attachment_id),
        None,
    )

    if attachment is None:
        raise NotFoundError("Anexo não encontrado.")

    url = storage_service.generate_download_url(
        object_name=attachment.file_url,
        file_name=attachment.file_name,
    )

    return ActivityAttachmentDownloadResponse(
        url=url,
        file_name=attachment.file_name,
        content_type=attachment.content_type,
        expires_in_seconds=DOWNLOAD_URL_EXPIRES_SECONDS,
    )


@router.patch(
    "/{activity_request_id}/cancel",
    response_model=ActivityRequestResponse,
    summary="Cancela uma solicitação pendente (aluno)",
    responses=error_responses(404, 409),
)
def cancel_activity_request(
    activity_request_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.STUDENT)),
    db: Session = Depends(get_db),
) -> ActivityRequest:
    return ActivityRequestActionService(db).cancel(
        activity_request_id=activity_request_id,
        user_id=current_user.id,
    )


@router.patch(
    "/{activity_request_id}/assume",
    response_model=ActivityReviewResponse,
    summary="Assume a análise de uma solicitação pendente (coordenador)",
    responses=error_responses(404, 409),
)
def assume_activity_request(
    activity_request_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.COORDINATOR)),
    db: Session = Depends(get_db),
) -> ActivityRequest:
    return ActivityReviewService(db).assume(
        activity_request_id=activity_request_id,
        current_user=current_user,
    )


@router.patch(
    "/{activity_request_id}/review",
    response_model=ActivityReviewResponse,
    summary="Aprova ou rejeita uma solicitação em análise (coordenador)",
    responses=error_responses(404, 409, 422),
)
def review_activity_request(
    activity_request_id: uuid.UUID,
    payload: ActivityReviewRequest,
    current_user: User = Depends(require_roles(UserRole.COORDINATOR)),
    db: Session = Depends(get_db),
) -> ActivityRequest:
    return ActivityReviewService(db).review(
        activity_request_id=activity_request_id,
        current_user=current_user,
        status=payload.status,
        accepted_hours=payload.accepted_hours,
        rejection_reason=payload.rejection_reason,
    )
