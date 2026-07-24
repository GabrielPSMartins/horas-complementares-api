from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.student import Student
from app.models.user import User, UserRole
from app.services.hours_service import HoursService


class ActivityReviewError(Exception):
    pass


class ActivityReviewService:

    def __init__(self, db: Session):
        self.db = db
        self.hours_service = HoursService(db)

    def assume(
        self,
        *,
        activity_request_id: UUID,
        current_user: User,
    ) -> ActivityRequest:
        if current_user.role != UserRole.COORDINATOR:
            raise ActivityReviewError(
                "Somente coordenadores podem assumir solicitações para análise."
            )

        activity_request = self.db.scalar(
            select(ActivityRequest)
            .options(
                selectinload(ActivityRequest.student).selectinload(Student.course)
            )
            .where(ActivityRequest.id == activity_request_id)
        )

        if activity_request is None:
            raise ActivityReviewError("Solicitação não encontrada.")

        if activity_request.student.course.coordinator_id != current_user.id:
            raise ActivityReviewError(
                "Você não possui permissão para assumir esta solicitação."
            )

        if activity_request.status != ActivityRequestStatus.PENDING:
            raise ActivityReviewError(
                "Apenas solicitações pendentes podem ser assumidas para análise. "
                f"Status atual: {activity_request.status.value}."
            )

        activity_request.status = ActivityRequestStatus.IN_REVIEW
        activity_request.in_review_by_id = current_user.id
        activity_request.in_review_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(activity_request)

        return activity_request

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
            select(ActivityRequest)
            .options(
                selectinload(ActivityRequest.activity_type),
                selectinload(ActivityRequest.student).selectinload(Student.course),
            )
            .where(ActivityRequest.id == activity_request_id)
        )

        if activity_request is None:
            raise ActivityReviewError("Solicitação não encontrada.")

        if activity_request.status not in (
            ActivityRequestStatus.PENDING,
            ActivityRequestStatus.IN_REVIEW,
        ):
            raise ActivityReviewError(
                "Apenas solicitações pendentes ou em análise podem ser revisadas. "
                f"Status atual: {activity_request.status.value}."
            )

        if activity_request.student.course.coordinator_id != current_user.id:
            raise ActivityReviewError(
                "Você não possui permissão para revisar esta solicitação."
            )

        if status == ActivityRequestStatus.APPROVED:
            self._validate_approval(activity_request, accepted_hours)
            activity_request.accepted_hours = accepted_hours
            activity_request.rejection_reason = None

        elif status == ActivityRequestStatus.REJECTED:
            if not rejection_reason:
                raise ActivityReviewError("Informe o motivo da rejeição.")
            activity_request.accepted_hours = 0
            activity_request.rejection_reason = rejection_reason

        else:
            raise ActivityReviewError("Status inválido para revisão.")

        activity_request.status = status
        activity_request.reviewed_by_id = current_user.id
        activity_request.reviewed_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(activity_request)

        return activity_request

    def _validate_approval(
        self,
        activity_request: ActivityRequest,
        accepted_hours: int | None,
    ) -> None:
        if accepted_hours is None:
            raise ActivityReviewError(
                "accepted_hours é obrigatório na aprovação."
            )

        if accepted_hours <= 0:
            raise ActivityReviewError(
                "accepted_hours deve ser maior que zero."
            )

        if accepted_hours > activity_request.requested_hours:
            raise ActivityReviewError(
                "accepted_hours não pode ser maior que o informado pelo aluno no certificado."
            )

        activity_type = activity_request.activity_type

        if accepted_hours > activity_type.max_hours_per_request:
            raise ActivityReviewError(
                f"accepted_hours não pode ultrapassar o limite por certificado "
                f"deste tipo de atividade ({activity_type.max_hours_per_request}h)."
            )

        if activity_type.max_hours_total is not None:
            already_approved = self.hours_service.get_approved_hours_by_type(
                student_id=activity_request.student_id,
                activity_type_id=activity_request.activity_type_id,
            )

            if already_approved + accepted_hours > activity_type.max_hours_total:
                remaining = activity_type.max_hours_total - already_approved

                if remaining <= 0:
                    raise ActivityReviewError(
                        f"O aluno já atingiu o limite total para este tipo de atividade "
                        f"({activity_type.max_hours_total}h). Aprovação não permitida."
                    )

                raise ActivityReviewError(
                    f"A aprovação de {accepted_hours}h ultrapassaria o limite total "
                    f"deste tipo de atividade. Máximo aceitável agora: {remaining}h."
                )