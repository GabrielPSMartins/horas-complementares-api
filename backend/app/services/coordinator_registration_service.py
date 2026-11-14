import logging
import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.exceptions import ConflictError, NotFoundError
from app.models.coordinator import Coordinator
from app.models.course import Course
from app.models.user import User, UserRole


logger = logging.getLogger(__name__)


class CoordinatorRegistrationService:
    """
    Responsável pelo cadastro de coordenadores, criando User e Coordinator
    numa única transação e vinculando o curso informado.
    """

    def __init__(self, db: Session):
        self.db = db

    def register(
        self,
        *,
        first_name: str,
        last_name: str,
        email: str,
        cpf: str,
        registration_number: str,
        course_id: uuid.UUID,
    ) -> Coordinator:
        email = self._normalize_email(email)
        course = self.db.scalar(select(Course).where(Course.id == course_id))

        if not course:
            raise NotFoundError("Curso informado não encontrado.")

        self._validate_uniqueness(
            email=email,
            cpf=cpf,
            registration_number=registration_number,
        )

        clean_cpf = self._only_digits(cpf)
        initial_password = f"FEPI*{clean_cpf}"

        user = User(
            email=email,
            username=registration_number,
            password_hash=hash_password(initial_password),
            role=UserRole.COORDINATOR,
            is_active=True,
            must_change_password=True,
        )

        try:
            self.db.add(user)
            self.db.flush()

            coordinator = Coordinator(
                user_id=user.id,
                first_name=first_name.strip(),
                last_name=last_name.strip(),
                cpf=clean_cpf,
                registration_number=registration_number,
                is_active=True,
            )

            self.db.add(coordinator)
            self.db.flush()

            course.coordinator_id = user.id

            self.db.commit()
        except IntegrityError as exc:
            # A checagem prévia não cobre requisições simultâneas: a constraint
            # UNIQUE do banco é a garantia final.
            self.db.rollback()
            raise ConflictError("Já existe um cadastro com estes dados (e-mail, CPF ou matrícula).") from exc

        self.db.refresh(coordinator)

        logger.info(
            "coordinator_registered | coordinator_id=%s course_id=%s",
            coordinator.id,
            course.id,
        )

        return coordinator

    def _validate_uniqueness(
        self,
        *,
        email: str,
        cpf: str,
        registration_number: str,
    ) -> None:
        clean_cpf = self._only_digits(cpf)

        if self.db.scalar(select(User).where(func.lower(User.email) == email)):
            raise ConflictError("Já existe um usuário com este email.")

        if self.db.scalar(
            select(Coordinator).where(Coordinator.registration_number == registration_number)
        ):
            raise ConflictError("Já existe um coordenador com esta matrícula.")

        if self.db.scalar(select(Coordinator).where(Coordinator.cpf == clean_cpf)):
            raise ConflictError("Já existe um coordenador com este CPF.")

        if self.db.scalar(select(User).where(User.username == registration_number)):
            raise ConflictError(
                "Já existe um usuário com este nome de usuário (matrícula)."
            )

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _only_digits(value: str) -> str:
        return re.sub(r"\D", "", value)