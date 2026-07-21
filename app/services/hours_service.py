import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.course import Course


class HoursService:

    def __init__(self, db: Session):
        self.db = db

    def get_total_approved_hours(self, student_id: uuid.UUID) -> int:
        """Retorna o total de horas aceitas pelo coordenador para o aluno."""
        result = self.db.scalar(
            select(func.coalesce(func.sum(ActivityRequest.accepted_hours), 0)).where(
                ActivityRequest.student_id == student_id,
                ActivityRequest.status == ActivityRequestStatus.APPROVED,
            )
        )
        return int(result or 0)

    def get_approved_hours_by_type(
        self,
        student_id: uuid.UUID,
        activity_type_id: uuid.UUID,
    ) -> int:
        """Retorna o total de horas aceitas para um tipo específico de atividade."""
        result = self.db.scalar(
            select(func.coalesce(func.sum(ActivityRequest.accepted_hours), 0)).where(
                ActivityRequest.student_id == student_id,
                ActivityRequest.activity_type_id == activity_type_id,
                ActivityRequest.status == ActivityRequestStatus.APPROVED,
            )
        )
        return int(result or 0)

    def has_reached_course_limit(
        self,
        student_id: uuid.UUID,
        course: Course,
    ) -> bool:
        """Verifica se o aluno atingiu o limite de horas do curso."""
        total = self.get_total_approved_hours(student_id)
        limit = course.total_required_hours + course.max_extra_hours
        return total >= limit