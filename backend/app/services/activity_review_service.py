import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError, PermissionDeniedError
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.student import Student
from app.models.user import User, UserRole
from app.services.activity_request_history_service import ActivityRequestHistoryService
from app.services.hours_service import HoursService


logger = logging.getLogger(__name__)


class ActivityReviewService:

    def __init__(self, db: Session):
        self.db = db
        self.hours_service = HoursService(db)
        self.history_service = ActivityRequestHistoryService(db)

    def assume(
        self,
        *,
        activity_request_id: UUID,
        current_user: User,
    ) -> ActivityRequest:
        if current_user.role != UserRole.COORDINATOR:
            raise PermissionDeniedError(
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
            raise NotFoundError("Solicitação não encontrada.")

        if activity_request.student.course.coordinator_id != current_user.id:
            raise PermissionDeniedError(
                "Você não possui permissão para assumir esta solicitação."
            )

        if activity_request.status != ActivityRequestStatus.PENDING:
            raise ConflictError(
                "Apenas solicitações pendentes podem ser assumidas para análise. "
                f"Status atual: {activity_request.status.value}."
            )

        previous_status = activity_request.status

        activity_request.status = ActivityRequestStatus.IN_REVIEW
        activity_request.in_review_by_id = current_user.id
        activity_request.in_review_at = datetime.now(UTC)

        self.history_service.record(
            activity_request_id=activity_request.id,
            changed_by_id=current_user.id,
            previous_status=previous_status,
            new_status=ActivityRequestStatus.IN_REVIEW,
            comment="Assumida para análise pelo coordenador.",
        )

        self.db.commit()
        self.db.refresh(activity_request)

        logger.info(
            "activity_request_assumed | activity_request_id=%s coordinator_user_id=%s",
            activity_request.id,
            current_user.id,
        )

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
            raise PermissionDeniedError(
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
            raise NotFoundError("Solicitação não encontrada.")

        if activity_request.student.course.coordinator_id != current_user.id:
            raise PermissionDeniedError(
                "Você não possui permissão para revisar esta solicitação."
            )

        if activity_request.status not in (
            ActivityRequestStatus.PENDING,
            ActivityRequestStatus.IN_REVIEW,
        ):
            raise ConflictError(
                "Apenas solicitações pendentes ou em análise podem ser revisadas. "
                f"Status atual: {activity_request.status.value}."
            )

        previous_status = activity_request.status
        previous_accepted_hours = activity_request.accepted_hours

        if status == ActivityRequestStatus.APPROVED:
            self._validate_approval(activity_request, accepted_hours)
            activity_request.accepted_hours = accepted_hours
            activity_request.rejection_reason = None
            history_comment = None

        elif status == ActivityRequestStatus.REJECTED:
            if not rejection_reason:
                raise BusinessRuleError("Informe o motivo da rejeição.")
            activity_request.accepted_hours = 0
            activity_request.rejection_reason = rejection_reason
            history_comment = rejection_reason

        else:
            raise BusinessRuleError("Status inválido para revisão.")

        activity_request.status = status
        activity_request.reviewed_by_id = current_user.id
        activity_request.reviewed_at = datetime.now(UTC)

        self.history_service.record(
            activity_request_id=activity_request.id,
            changed_by_id=current_user.id,
            previous_status=previous_status,
            new_status=status,
            previous_accepted_hours=previous_accepted_hours,
            new_accepted_hours=activity_request.accepted_hours,
            comment=history_comment,
        )

        self.db.commit()
        self.db.refresh(activity_request)

        logger.info(
            "activity_request_reviewed | activity_request_id=%s coordinator_user_id=%s status=%s accepted_hours=%s",
            activity_request.id,
            current_user.id,
            status.value,
            activity_request.accepted_hours,
        )

        return activity_request

    def _validate_approval(
        self,
        activity_request: ActivityRequest,
        accepted_hours: int | None,
    ) -> None:
        if accepted_hours is None:
            raise BusinessRuleError(
                "accepted_hours é obrigatório na aprovação."
            )

        if accepted_hours <= 0:
            raise BusinessRuleError(
                "accepted_hours deve ser maior que zero."
            )

        if accepted_hours > activity_request.requested_hours:
            raise BusinessRuleError(
                "accepted_hours não pode ser maior que o informado pelo aluno no certificado."
            )

        activity_type = activity_request.activity_type

        if accepted_hours > activity_type.max_hours_per_request:
            raise BusinessRuleError(
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
                    raise BusinessRuleError(
                        f"O aluno já atingiu o limite total para este tipo de atividade "
                        f"({activity_type.max_hours_total}h). Aprovação não permitida."
                    )

                raise BusinessRuleError(
                    f"A aprovação de {accepted_hours}h ultrapassaria o limite total "
                    f"deste tipo de atividade. Máximo aceitável agora: {remaining}h."
                )

        course = activity_request.student.course
        course_limit = course.total_required_hours + course.max_extra_hours
        already_approved_total = self.hours_service.get_total_approved_hours(
            activity_request.student_id
        )

        if already_approved_total + accepted_hours > course_limit:
            remaining = course_limit - already_approved_total

            if remaining <= 0:
                raise BusinessRuleError(
                    f"O aluno já atingiu o limite de horas do curso "
                    f"({course.total_required_hours}h + {course.max_extra_hours}h de tolerância). "
                    "Aprovação não permitida."
                )

            raise BusinessRuleError(
                f"A aprovação de {accepted_hours}h ultrapassaria o limite de horas do curso "
                f"({course_limit}h). Máximo aceitável agora: {remaining}h."
            )