import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course


class HoursService:

    def __init__(self, db: Session):
        self.db = db

    def get_total_approved_hours(self, student_id: uuid.UUID) -> int:
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
        total = self.get_total_approved_hours(student_id)
        limit = course.total_required_hours + course.max_extra_hours
        return total >= limit

    def get_hours_by_status(self, student_id: uuid.UUID) -> dict[ActivityRequestStatus, int]:
        rows = self.db.execute(
            select(
                ActivityRequest.status,
                func.count(ActivityRequest.id),
            )
            .where(ActivityRequest.student_id == student_id)
            .group_by(ActivityRequest.status)
        ).all()

        counts = {status: 0 for status in ActivityRequestStatus}
        for status, count in rows:
            counts[status] = count

        return counts

    def get_hours_summary(
        self,
        student_id: uuid.UUID,
        course: Course,
    ) -> dict:
        total_approved = self.get_total_approved_hours(student_id)
        limit = course.total_required_hours + course.max_extra_hours
        remaining = max(limit - total_approved, 0)
        progress_percentage = (
            round(min(total_approved / course.total_required_hours, 1.0) * 100, 2)
            if course.total_required_hours > 0
            else 0.0
        )

        by_type_rows = self.db.execute(
            select(
                ActivityType.id,
                ActivityType.name,
                func.coalesce(func.sum(ActivityRequest.accepted_hours), 0),
            )
            .join(ActivityRequest, ActivityRequest.activity_type_id == ActivityType.id)
            .where(
                ActivityRequest.student_id == student_id,
                ActivityRequest.status == ActivityRequestStatus.APPROVED,
            )
            .group_by(ActivityType.id, ActivityType.name)
        ).all()

        by_type = [
            {
                "activity_type_id": type_id,
                "activity_type_name": type_name,
                "approved_hours": int(approved_hours),
            }
            for type_id, type_name, approved_hours in by_type_rows
        ]

        return {
            "total_approved_hours": total_approved,
            "total_required_hours": course.total_required_hours,
            "max_extra_hours": course.max_extra_hours,
            "hours_limit": limit,
            "remaining_hours": remaining,
            "progress_percentage": progress_percentage,
            "has_reached_limit": total_approved >= limit,
            "requests_by_status": self.get_hours_by_status(student_id),
            "approved_hours_by_type": by_type,
        }