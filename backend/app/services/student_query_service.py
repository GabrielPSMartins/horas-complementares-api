import uuid
from math import ceil

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.course import Course
from app.models.student import Student
from app.schemas.student import StudentListItemResponse


class StudentQueryService:
    """
    Responsável pela listagem de alunos de um curso com o resumo de horas.

    As horas aprovadas e as solicitações em aberto são agregadas no banco,
    em uma única consulta, para que alunos sem nenhuma solicitação também
    apareçam (com zero horas).
    """

    def __init__(self, db: Session):
        self.db = db

    def list_by_course(
        self,
        *,
        course: Course,
        search: str | None = None,
        semester: int | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[StudentListItemResponse], int]:
        approved_hours = (
            select(
                ActivityRequest.student_id,
                func.sum(ActivityRequest.accepted_hours).label("total"),
            )
            .where(ActivityRequest.status == ActivityRequestStatus.APPROVED)
            .group_by(ActivityRequest.student_id)
            .subquery()
        )

        open_requests = (
            select(
                ActivityRequest.student_id,
                func.count(ActivityRequest.id).label("total"),
            )
            .where(
                ActivityRequest.status.in_(
                    (ActivityRequestStatus.PENDING, ActivityRequestStatus.IN_REVIEW)
                )
            )
            .group_by(ActivityRequest.student_id)
            .subquery()
        )

        filters = [Student.course_id == course.id, Student.is_active.is_(True)]

        if semester is not None:
            filters.append(Student.current_semester == semester)

        if search:
            search_term = f"%{search}%"
            filters.append(
                or_(
                    (Student.first_name + " " + Student.last_name).ilike(search_term),
                    Student.registration_number.ilike(search_term),
                )
            )

        total = self.db.scalar(select(func.count(Student.id)).where(*filters)) or 0

        rows = self.db.execute(
            select(
                Student,
                func.coalesce(approved_hours.c.total, 0),
                func.coalesce(open_requests.c.total, 0),
            )
            .outerjoin(approved_hours, approved_hours.c.student_id == Student.id)
            .outerjoin(open_requests, open_requests.c.student_id == Student.id)
            .options(selectinload(Student.user))
            .where(*filters)
            .order_by(Student.first_name, Student.last_name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()

        hours_limit = course.total_required_hours + course.max_extra_hours

        items = [
            StudentListItemResponse(
                id=student.id,
                name=student.full_name,
                first_name=student.first_name,
                last_name=student.last_name,
                email=student.user.email,
                registration_number=student.registration_number,
                current_semester=student.current_semester,
                total_approved_hours=int(approved),
                total_required_hours=course.total_required_hours,
                hours_limit=hours_limit,
                progress_percentage=self._progress(int(approved), course.total_required_hours),
                open_requests=int(open_count),
            )
            for student, approved, open_count in rows
        ]

        return items, int(total)

    @staticmethod
    def _progress(total_approved: int, total_required: int) -> float:
        if total_required <= 0:
            return 0.0
        return round(min(total_approved / total_required, 1.0) * 100, 2)

    @staticmethod
    def calculate_total_pages(total: int, page_size: int) -> int:
        if total == 0:
            return 0
        return ceil(total / page_size)
