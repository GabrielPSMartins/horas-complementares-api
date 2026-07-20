from datetime import datetime, UTC
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_request import (
    ActivityRequest,
    ActivityRequestStatus,
)
from app.models.student import Student
from app.models.user import User, UserRole


class ActivityReviewError(Exception):
    pass


class ActivityReviewService:

    def __init__(self, db: Session):
        self.db = db

    def review(
        self,
        *,
        activity_request_id: UUID,
        current_user: User,
        status: ActivityRequestStatus,
        accepted_hours: int | None,
        rejection_reason: str | None,
    ) -> ActivityRequest:

        if current_user.role != UserRole.COORDINATOR:
            raise ActivityReviewError(
                "Somente coordenadores podem revisar solicitações."
            )

        activity_request = self.db.scalar(
            select(ActivityRequest).where(
                ActivityRequest.id == activity_request_id
            )
        )

        if activity_request is None:
            raise ActivityReviewError(
                "Solicitação não encontrada."
            )

        if activity_request.status != ActivityRequestStatus.PENDING:
            raise ActivityReviewError(
                "A solicitação já foi analisada."
            )

        student = self.db.scalar(
            select(Student).where(
                Student.id == activity_request.student_id
            )
        )

        if student.course.coordinator_id != current_user.id:
            raise ActivityReviewError(
                "Você não possui permissão para analisar esta solicitação."
            )

        if status == ActivityRequestStatus.APPROVED:

            if accepted_hours is None:
                raise ActivityReviewError(
                    "accepted_hours é obrigatório."
                )

            if accepted_hours > activity_request.requested_hours:
                raise ActivityReviewError(
                    "accepted_hours não pode ser maior que requested_hours."
                )

            activity_request.accepted_hours = accepted_hours
            activity_request.rejection_reason = None

        elif status == ActivityRequestStatus.REJECTED:

            if not rejection_reason:
                raise ActivityReviewError(
                    "Informe o motivo da rejeição."
                )

            activity_request.accepted_hours = 0
            activity_request.rejection_reason = rejection_reason

        else:
            raise ActivityReviewError(
                "Status inválido para revisão."
            )

        activity_request.status = status
        activity_request.reviewed_by_id = current_user.id
        activity_request.reviewed_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(activity_request)

        return activity_request