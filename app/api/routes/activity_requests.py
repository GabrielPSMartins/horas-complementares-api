import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies.auth import get_current_user
from app.db.dependencies import get_db
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_request import ActivityRequestResponse
from app.services.storage import (
    InvalidFileError,
    MinioStorageService,
    StorageError,
    get_storage_service,
)
from app.schemas.activity_review import (
    ActivityReviewRequest,
    ActivityReviewResponse,
)
from datetime import datetime, timezone


router = APIRouter(prefix="/activity-requests", tags=["activity-requests"])


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

@router.patch(
    "/{activity_request_id}/review",
    response_model=ActivityReviewResponse,
)
def review_activity_request(
    activity_request_id: uuid.UUID,
    payload: ActivityReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.COORDINATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente coordenadores podem revisar solicitações.",
        )

    activity_request = db.scalar(
        select(ActivityRequest)
        .options(
            selectinload(ActivityRequest.student).selectinload(Student.course)
        )
        .where(ActivityRequest.id == activity_request_id)
    )

    if activity_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitação não encontrada.",
        )

    if activity_request.status != ActivityRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A solicitação já foi analisada.",
        )

    if activity_request.student.course.coordinator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não possui permissão para revisar esta solicitação.",
        )

    if payload.status == ActivityRequestStatus.APPROVED:

        if payload.accepted_hours is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="accepted_hours é obrigatório.",
            )

        if payload.accepted_hours > activity_request.requested_hours:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="accepted_hours não pode ser maior que requested_hours.",
            )

        activity_request.accepted_hours = payload.accepted_hours
        activity_request.rejection_reason = None

    elif payload.status == ActivityRequestStatus.REJECTED:

        if not payload.rejection_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe o motivo da rejeição.",
            )

        activity_request.accepted_hours = 0
        activity_request.rejection_reason = payload.rejection_reason

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status inválido para revisão.",
        )

    activity_request.status = payload.status
    activity_request.reviewed_by_id = current_user.id
    activity_request.reviewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(activity_request)

    return activity_request