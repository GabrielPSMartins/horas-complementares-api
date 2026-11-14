import logging
import uuid
from datetime import date

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.student import Student
from app.services.activity_request_history_service import ActivityRequestHistoryService
from app.services.hours_service import HoursService
from app.services.storage import MinioStorageService


logger = logging.getLogger(__name__)


class ActivityRequestCreationService:
    """
    Responsável pela criação de uma solicitação de horas pelo aluno.

    Valida as regras de envio (horas positivas e dentro do limite por
    certificado, data não futura, limite do curso, tipo de atividade do curso
    e certificado obrigatório), armazena o certificado e grava a solicitação, o
    anexo e o primeiro registro do histórico na mesma transação. Se a
    gravação falhar, a transação é desfeita e o certificado é removido.
    """

    def __init__(self, db: Session, storage_service: MinioStorageService):
        self.db = db
        self.storage_service = storage_service
        self.hours_service = HoursService(db)
        self.history_service = ActivityRequestHistoryService(db)

    def create(
        self,
        *,
        student: Student,
        activity_type_id: uuid.UUID,
        title: str,
        requested_hours: int,
        location: str,
        activity_date: date,
        description: str | None,
        file: UploadFile | None,
    ) -> ActivityRequest:
        if requested_hours <= 0:
            raise BusinessRuleError("A quantidade de horas deve ser maior que zero.")

        if activity_date > date.today():
            raise BusinessRuleError("A data da atividade não pode ser futura.")

        course = student.course

        if self.hours_service.has_reached_course_limit(student.id, course):
            raise BusinessRuleError(
                f"Você já atingiu o limite de horas complementares do curso "
                f"({course.total_required_hours}h + {course.max_extra_hours}h de tolerância). "
                "Novas solicitações não são permitidas."
            )

        activity_type = self.db.scalar(
            select(ActivityType).where(
                ActivityType.id == activity_type_id,
                ActivityType.course_id == student.course_id,
                ActivityType.is_active.is_(True),
            )
        )

        if not activity_type:
            raise NotFoundError("Tipo de atividade não encontrado para o curso do aluno.")

        if requested_hours > activity_type.max_hours_per_request:
            raise BusinessRuleError(
                "As horas solicitadas ultrapassam o limite por certificado deste "
                f"tipo de atividade ({activity_type.max_hours_per_request}h)."
            )

        has_file = file is not None and bool(file.filename)

        if activity_type.requires_attachment and not has_file:
            raise BusinessRuleError("Este tipo de atividade exige o envio do certificado.")

        file_url = (
            self.storage_service.upload_certificate(file=file, student_id=student.id)
            if has_file
            else None
        )

        try:
            activity_request = self._save(
                student=student,
                activity_type_id=activity_type.id,
                title=title,
                requested_hours=requested_hours,
                location=location,
                activity_date=activity_date,
                description=description or None,
                file=file,
                file_url=file_url,
            )
        except Exception:
            # O arquivo já está no MinIO, mas a solicitação não foi gravada:
            # desfaz a transação e remove o arquivo para não deixá-lo órfão.
            self.db.rollback()
            if file_url:
                self.storage_service.remove_certificate(file_url)
            raise

        return self.db.scalar(
            select(ActivityRequest)
            .options(selectinload(ActivityRequest.attachments))
            .where(ActivityRequest.id == activity_request.id)
        )

    def _save(
        self,
        *,
        student: Student,
        activity_type_id: uuid.UUID,
        title: str,
        requested_hours: int,
        location: str,
        activity_date: date,
        description: str | None,
        file: UploadFile | None,
        file_url: str | None,
    ) -> ActivityRequest:
        activity_request = ActivityRequest(
            student_id=student.id,
            activity_type_id=activity_type_id,
            title=title,
            description=description,
            location=location,
            activity_date=activity_date,
            requested_hours=requested_hours,
            accepted_hours=None,
            status=ActivityRequestStatus.PENDING,
        )

        self.db.add(activity_request)
        self.db.flush()

        if file_url:
            self.db.add(
                ActivityAttachment(
                    activity_request_id=activity_request.id,
                    file_name=file.filename or "certificate",
                    file_url=file_url,
                    content_type=file.content_type,
                    size_bytes=file.size,
                )
            )

        self.history_service.record(
            activity_request_id=activity_request.id,
            changed_by_id=student.user_id,
            previous_status=None,
            new_status=ActivityRequestStatus.PENDING,
            new_accepted_hours=None,
            comment="Solicitação criada pelo aluno.",
        )

        self.db.commit()

        logger.info(
            "activity_request_created | activity_request_id=%s student_id=%s requested_hours=%s has_attachment=%s",
            activity_request.id,
            student.id,
            requested_hours,
            bool(file_url),
        )

        return activity_request
