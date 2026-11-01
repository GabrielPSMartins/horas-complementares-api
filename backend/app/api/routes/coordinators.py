from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_roles
from app.api.responses import error_responses
from app.db.dependencies import get_db
from app.models.coordinator import Coordinator
from app.models.course import Course
from app.models.user import User, UserRole
from app.schemas.coordinator import (
    CoordinatorCreateRequest,
    CoordinatorCreateResponse,
    CoordinatorMeResponse,
)
from app.services.coordinator_registration_service import CoordinatorRegistrationService

router = APIRouter(
    prefix="/coordinators",
    tags=["coordinators"],
    responses=error_responses(401, 403),
)


@router.get(
    "/me",
    response_model=CoordinatorMeResponse,
    summary="Perfil do coordenador logado",
    responses=error_responses(404),
)
def get_my_coordinator_profile(
    current_user: User = Depends(require_roles(UserRole.COORDINATOR)),
    db: Session = Depends(get_db),
) -> CoordinatorMeResponse:
    coordinator = db.scalar(
        select(Coordinator).where(Coordinator.user_id == current_user.id)
    )

    if not coordinator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de coordenador não encontrado.",
        )

    course = db.scalar(
        select(Course).where(Course.coordinator_id == current_user.id)
    )

    return CoordinatorMeResponse(
        id=coordinator.id,
        user_id=coordinator.user_id,
        first_name=coordinator.first_name,
        last_name=coordinator.last_name,
        full_name=coordinator.full_name,
        email=current_user.email,
        cpf=coordinator.cpf,
        registration_number=coordinator.registration_number,
        username=current_user.username,
        must_change_password=current_user.must_change_password,
        course_id=course.id if course else None,
        course_name=course.name if course else None,
        course_total_semesters=course.total_semesters if course else None,
    )


@router.post(
    "",
    response_model=CoordinatorCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra um coordenador e o vincula a um curso (ROOT)",
    responses=error_responses(404, 409, 422),
)
def create_coordinator(
    payload: CoordinatorCreateRequest,
    current_user: User = Depends(require_roles(UserRole.ROOT)),
    db: Session = Depends(get_db),
) -> CoordinatorCreateResponse:
    coordinator = CoordinatorRegistrationService(db).register(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        cpf=payload.cpf,
        registration_number=payload.registration_number,
        course_id=payload.course_id,
    )

    return CoordinatorCreateResponse.model_validate(coordinator)