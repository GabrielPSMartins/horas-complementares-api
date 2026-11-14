from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.profiles import get_coordinator_course
from app.api.responses import error_responses
from app.db.dependencies import get_db
from app.models.course import Course
from app.schemas.dashboard import CoordinatorDashboardResponse
from app.services.hours_service import HoursService

router = APIRouter(prefix="/coordinator", tags=["coordinator"])


@router.get(
    "/dashboard",
    response_model=CoordinatorDashboardResponse,
    summary="Totais de solicitações por status e de alunos ativos do curso",
    responses=error_responses(401, 403, 404),
)
def get_coordinator_dashboard(
    semester: int | None = Query(
        default=None,
        ge=1,
        description="Filtra o dashboard por semestre dos alunos",
    ),
    course: Course = Depends(get_coordinator_course),
    db: Session = Depends(get_db),
) -> CoordinatorDashboardResponse:
    summary = HoursService(db).get_course_requests_summary(course.id, semester=semester)

    return CoordinatorDashboardResponse(**summary)
