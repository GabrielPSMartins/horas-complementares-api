from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_roles
from app.db.dependencies import get_db
from app.models.coordinator import Coordinator
from app.models.course import Course
from app.models.user import User, UserRole
from app.schemas.coordinator import (
    CoordinatorCreateRequest,
    CoordinatorCreateResponse,
    CoordinatorMeResponse,
)
from app.services.coordinator_registration_service import (
    CoordinatorRegistrationError,
    CoordinatorRegistrationService,
)

router = APIRouter(prefix="/coordinators", tags=["coordinators"])


@router.get("/me", response_model=CoordinatorMeResponse)
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
        name=coordinator.name,
        email=current_user.email,
        cpf=coordinator.cpf,
        registration_number=coordinator.registration_number,
        username=current_user.username,
        must_change_password=current_user.must_change_password,
        course_id=course.id if course else None,
        course_name=course.name if course else None,
    )


@router.post(
    "",
    response_model=CoordinatorCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_coordinator(
    payload: CoordinatorCreateRequest,
    current_user: User = Depends(require_roles(UserRole.ROOT)),
    db: Session = Depends(get_db),
) -> Coordinator:
    service = CoordinatorRegistrationService(db)

    try:
        coordinator = service.register(
            name=payload.name,
            email=payload.email,
            cpf=payload.cpf,
            registration_number=payload.registration_number,
            course_id=payload.course_id,
        )
    except CoordinatorRegistrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return CoordinatorCreateResponse(
        id=coordinator.id,
        user_id=coordinator.user_id,
        name=coordinator.name,
        email=payload.email,
        cpf=coordinator.cpf,
        registration_number=coordinator.registration_number,
        username=coordinator.registration_number,
        course_id=payload.course_id,
        created_at=coordinator.created_at,
    )