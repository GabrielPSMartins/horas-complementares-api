from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_roles
from app.db.dependencies import get_db
from app.models.coordinator import Coordinator
from app.models.user import User, UserRole
from app.schemas.coordinator import CoordinatorCreateRequest, CoordinatorCreateResponse
from app.services.coordinator_registration_service import (
    CoordinatorRegistrationError,
    CoordinatorRegistrationService,
)

router = APIRouter(prefix="/coordinators", tags=["coordinators"])


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