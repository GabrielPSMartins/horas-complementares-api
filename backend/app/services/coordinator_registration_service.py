import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.coordinator import Coordinator
from app.models.course import Course
from app.models.user import User, UserRole


class CoordinatorRegistrationError(Exception):
    pass


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
        name: str,
        email: str,
        cpf: str,
        registration_number: str,
        course_id: uuid.UUID,
    ) -> Coordinator:
        course = self.db.scalar(select(Course).where(Course.id == course_id))

        if not course:
            raise CoordinatorRegistrationError("Curso informado não encontrado.")

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

        self.db.add(user)
        self.db.flush()

        coordinator = Coordinator(
            user_id=user.id,
            name=name,
            cpf=clean_cpf,
            registration_number=registration_number,
            is_active=True,
        )

        self.db.add(coordinator)
        self.db.flush()

        course.coordinator_id = user.id

        self.db.commit()
        self.db.refresh(coordinator)

        return coordinator

    def _validate_uniqueness(
        self,
        *,
        email: str,
        cpf: str,
        registration_number: str,
    ) -> None:
        clean_cpf = self._only_digits(cpf)

        if self.db.scalar(select(User).where(User.email == email)):
            raise CoordinatorRegistrationError("Já existe um usuário com este email.")

        if self.db.scalar(
            select(Coordinator).where(Coordinator.registration_number == registration_number)
        ):
            raise CoordinatorRegistrationError("Já existe um coordenador com esta matrícula.")

        if self.db.scalar(select(Coordinator).where(Coordinator.cpf == clean_cpf)):
            raise CoordinatorRegistrationError("Já existe um coordenador com este CPF.")

        if self.db.scalar(select(User).where(User.username == registration_number)):
            raise CoordinatorRegistrationError(
                "Já existe um usuário com este nome de usuário (matrícula)."
            )

    @staticmethod
    def _only_digits(value: str) -> str:
        return re.sub(r"\D", "", value)