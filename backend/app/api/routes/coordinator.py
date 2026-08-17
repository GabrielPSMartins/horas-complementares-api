from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api.dependencies.auth import require_roles
from backend.app.db.dependencies import get_db
from backend.app.models.course import Course
from backend.app.models.user import User, UserRole
from backend.app.schemas.dashboard import CoordinatorDashboardResponse
from backend.app.services.hours_service import HoursService

router = APIRouter(prefix="/coordinator", tags=["coordinator"])


@router.get("/dashboard", response_model=CoordinatorDashboardResponse)
def get_coordinator_dashboard(
    current_user: User = Depends(require_roles(UserRole.COORDINATOR)),
    db: Session = Depends(get_db),
) -> CoordinatorDashboardResponse:
    course = db.scalar(
        select(Course).where(Course.coordinator_id == current_user.id)
    )

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum curso vinculado a este coordenador.",
        )

    hours_service = HoursService(db)
    summary = hours_service.get_course_requests_summary(course.id)

    return CoordinatorDashboardResponse(**summary)