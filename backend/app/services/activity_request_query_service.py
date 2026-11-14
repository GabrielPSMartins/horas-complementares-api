import uuid
from datetime import date
from math import ceil

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.interfaces import LoaderOption

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.student import Student
from app.models.user import User, UserRole


class ActivityRequestQueryService:
    """
    Responsável pelas consultas de solicitações.

    Isolado dos services de ação porque lida apenas com leitura e
    filtros. Reutilizado pela listagem do aluno (escopo: student_id),
    pela do coordenador (escopo: course_id) e pelas consultas de uma
    solicitação específica (detalhe, histórico e anexo).
    """

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

        total = self._count(query)

        query = (
            query.options(
                selectinload(ActivityRequest.attachments),
                selectinload(ActivityRequest.in_review_by).selectinload(User.coordinator_profile),
                selectinload(ActivityRequest.reviewer).selectinload(User.coordinator_profile),
            )
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
        semester: int | None = None,
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

        if semester is not None:
            query = query.where(Student.current_semester == semester)

        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    (Student.first_name + " " + Student.last_name).ilike(search_term),
                    Student.registration_number.ilike(search_term),
                )
            )

        total = self._count(query)

        query = (
            query.options(
                selectinload(ActivityRequest.attachments),
                selectinload(ActivityRequest.student),
                selectinload(ActivityRequest.in_review_by).selectinload(User.coordinator_profile),
                selectinload(ActivityRequest.reviewer).selectinload(User.coordinator_profile),
            )
            .order_by(ActivityRequest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        items = list(self.db.scalars(query).all())

        return items, total

    def get_visible_to(
        self,
        activity_request_id: uuid.UUID,
        current_user: User,
        *options: LoaderOption,
    ) -> ActivityRequest:
        """
        Busca uma solicitação que o usuário pode ver: o aluno dono ou o
        coordenador do curso do aluno. `options` permite carregar junto os
        relacionamentos que cada rota precisa (histórico, anexos...).
        """
        activity_request = self.db.scalar(
            select(ActivityRequest)
            .options(
                selectinload(ActivityRequest.student).selectinload(Student.course),
                *options,
            )
            .where(ActivityRequest.id == activity_request_id)
        )

        if activity_request is None:
            raise NotFoundError("Solicitação não encontrada.")

        is_owner_student = (
            current_user.role == UserRole.STUDENT
            and activity_request.student.user_id == current_user.id
        )
        is_course_coordinator = (
            current_user.role == UserRole.COORDINATOR
            and activity_request.student.course.coordinator_id == current_user.id
        )

        if not (is_owner_student or is_course_coordinator):
            raise PermissionDeniedError("Você não possui permissão para acessar esta solicitação.")

        return activity_request

    def _count(self, query) -> int:
        """Conta as linhas da consulta no banco (COUNT), sem carregá-las."""
        return self.db.scalar(
            select(func.count()).select_from(query.order_by(None).subquery())
        ) or 0

    @staticmethod
    def calculate_total_pages(total: int, page_size: int) -> int:
        if total == 0:
            return 0
        return ceil(total / page_size)