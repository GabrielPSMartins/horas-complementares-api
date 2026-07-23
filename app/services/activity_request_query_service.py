import uuid
from datetime import date
from math import ceil

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.student import Student


class ActivityRequestQueryService:

    def __init__(self, db: Session):
        self.db = db

    def list_by_student(
        self,
        *,
        student_id: uuid.UUID,
        status: ActivityRequestStatus | None = None,
        activity_type_id: uuid.UUID | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[ActivityRequest], int]:
        query = select(ActivityRequest).where(
            ActivityRequest.student_id == student_id
        )

        if status is not None:
            query = query.where(ActivityRequest.status == status)

        if activity_type_id is not None:
            query = query.where(
                ActivityRequest.activity_type_id == activity_type_id
            )

        if start_date is not None:
            query = query.where(ActivityRequest.activity_date >= start_date)

        if end_date is not None:
            query = query.where(ActivityRequest.activity_date <= end_date)

        total = len(self.db.scalars(query).all())

        query = (
            query.options(selectinload(ActivityRequest.attachments))
            .order_by(ActivityRequest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        items = list(self.db.scalars(query).all())

        return items, total

    def list_by_coordinator_course(
        self,
        *,
        course_id: uuid.UUID,
        status: ActivityRequestStatus | None = None,
        activity_type_id: uuid.UUID | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[ActivityRequest], int]:
        
        query = (
            select(ActivityRequest)
            .join(Student, Student.id == ActivityRequest.student_id)
            .where(Student.course_id == course_id)
        )

        if status is not None:
            query = query.where(ActivityRequest.status == status)

        if activity_type_id is not None:
            query = query.where(
                ActivityRequest.activity_type_id == activity_type_id
            )

        if start_date is not None:
            query = query.where(ActivityRequest.activity_date >= start_date)

        if end_date is not None:
            query = query.where(ActivityRequest.activity_date <= end_date)

        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Student.name.ilike(search_term),
                    Student.registration_number.ilike(search_term),
                )
            )

        total = len(self.db.scalars(query).all())

        query = (
            query.options(
                selectinload(ActivityRequest.attachments),
                selectinload(ActivityRequest.student),
            )
            .order_by(ActivityRequest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        items = list(self.db.scalars(query).all())

        return items, total

    @staticmethod
    def get_student_by_user_id(db: Session, user_id: uuid.UUID) -> Student | None:
        return db.scalar(select(Student).where(Student.user_id == user_id))

    @staticmethod
    def calculate_total_pages(total: int, page_size: int) -> int:
        if total == 0:
            return 0
        return ceil(total / page_size)