import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.activity_request import ActivityRequest, ActivityRequestStatus
from backend.app.models.student import Student
from backend.app.services.activity_request_history_service import ActivityRequestHistoryService


class ActivityRequestActionError(Exception):
    pass


class ActivityRequestActionService:

    def __init__(self, db: Session):
        self.db = db
        self.history_service = ActivityRequestHistoryService(db)

    def cancel(
        self,
        *,
        activity_request_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> ActivityRequest:
        student = self.db.scalar(
            select(Student).where(Student.user_id == user_id)
        )

        if not student:
            raise ActivityRequestActionError(
                "Perfil de aluno não encontrado."
            )

        activity_request = self.db.scalar(
            select(ActivityRequest).where(
                ActivityRequest.id == activity_request_id
            )
        )

        if activity_request is None:
            raise ActivityRequestActionError(
                "Solicitação não encontrada."
            )

        if activity_request.student_id != student.id:
            raise ActivityRequestActionError(
                "Você não possui permissão para cancelar esta solicitação."
            )

        if activity_request.status == ActivityRequestStatus.IN_REVIEW:
            raise ActivityRequestActionError(
                "Esta solicitação já está em análise pelo coordenador "
                "e não pode mais ser cancelada."
            )

        if activity_request.status != ActivityRequestStatus.PENDING:
            raise ActivityRequestActionError(
                "Apenas solicitações pendentes podem ser canceladas. "
                f"Status atual: {activity_request.status.value}."
            )

        previous_status = activity_request.status

        activity_request.status = ActivityRequestStatus.CANCELED

        self.history_service.record(
            activity_request_id=activity_request.id,
            changed_by_id=user_id,
            previous_status=previous_status,
            new_status=ActivityRequestStatus.CANCELED,
            comment="Cancelado pelo aluno.",
        )

        self.db.commit()
        self.db.refresh(activity_request)

        return activity_request