import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.student import Student


class ActivityRequestActionError(Exception):
    pass


class ActivityRequestActionService:

    def __init__(self, db: Session):
        self.db = db

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

        if activity_request.status != ActivityRequestStatus.PENDING:
            raise ActivityRequestActionError(
                "Apenas solicitações pendentes podem ser canceladas. "
                f"Status atual: {activity_request.status.value}."
            )

        activity_request.status = ActivityRequestStatus.CANCELED

        self.db.commit()
        self.db.refresh(activity_request)

        return activity_request