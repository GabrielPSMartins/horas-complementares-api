import logging
import re
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError, PermissionDeniedError
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole


logger = logging.getLogger(__name__)


class StudentRegistrationService:

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
        current_semester: int,
        enrollment_date: date,
        expected_graduation_date: date | None,
        course_id: uuid.UUID | None,
        current_user: User,
    ) -> Student:
        email = self._normalize_email(email)
        course = self._resolve_course(course_id=course_id, current_user=current_user)

        if current_semester > course.total_semesters:
            raise BusinessRuleError(
                f"O semestre informado excede a duração do curso ({course.total_semesters} semestres)."
            )

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
            role=UserRole.STUDENT,
            is_active=True,
            must_change_password=True,
        )

        try:
            self.db.add(user)
            self.db.flush()

            student = Student(
                user_id=user.id,
                course_id=course.id,
                first_name=first_name.strip(),
                last_name=last_name.strip(),
                cpf=clean_cpf,
                registration_number=registration_number,
                current_semester=current_semester,
                enrollment_date=enrollment_date,
                expected_graduation_date=expected_graduation_date,
                is_active=True,
            )

            self.db.add(student)
            self.db.commit()
        except IntegrityError as exc:
            # A checagem prévia não cobre requisições simultâneas: a constraint
            # UNIQUE do banco é a garantia final.
            self.db.rollback()
            raise ConflictError("Já existe um cadastro com estes dados (e-mail, CPF ou matrícula).") from exc

        self.db.refresh(student)

        logger.info(
            "student_registered | student_id=%s course_id=%s registered_by_user_id=%s",
            student.id,
            course.id,
            current_user.id,
        )

        return student

    def _resolve_course(
        self,
        *,
        course_id: uuid.UUID | None,
        current_user: User,
    ) -> Course:
        if current_user.role == UserRole.ROOT:
            if course_id is None:
                raise BusinessRuleError(
                    "course_id é obrigatório quando o cadastro é feito por ROOT."
                )

            course = self.db.scalar(select(Course).where(Course.id == course_id))

            if not course:
                raise NotFoundError("Curso informado não encontrado.")

            return course

        course = self.db.scalar(
            select(Course).where(Course.coordinator_id == current_user.id)
        )

        if not course:
            raise NotFoundError(
                "Nenhum curso vinculado a este coordenador."
            )

        if course_id is not None and course_id != course.id:
            raise PermissionDeniedError(
                "Você só pode cadastrar alunos no curso que você coordena."
            )

        return course

    def _validate_uniqueness(
        self,
        *,
        email: str,
        cpf: str,
        registration_number: str,
    ) -> None:
        clean_cpf = self._only_digits(cpf)

        existing_email = self.db.scalar(select(User).where(func.lower(User.email) == email))
        if existing_email:
            raise ConflictError("Já existe um usuário com este email.")

        existing_registration = self.db.scalar(
            select(Student).where(Student.registration_number == registration_number)
        )
        if existing_registration:
            raise ConflictError(
                "Já existe um aluno com esta matrícula."
            )

        existing_cpf = self.db.scalar(
            select(Student).where(Student.cpf == clean_cpf)
        )
        if existing_cpf:
            raise ConflictError("Já existe um aluno com este CPF.")

        existing_username = self.db.scalar(
            select(User).where(User.username == registration_number)
        )
        if existing_username:
            raise ConflictError(
                "Já existe um usuário com este nome de usuário (matrícula)."
            )

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _only_digits(value: str) -> str:
        return re.sub(r"\D", "", value)