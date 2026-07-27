import re
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole


class StudentRegistrationError(Exception):
    pass


class StudentRegistrationService:

    def __init__(self, db: Session):
        self.db = db

    def register(
        self,
        *,
        name: str,
        email: str,
        cpf: str,
        registration_number: str,
        enrollment_date: date,
        expected_graduation_date: date | None,
        course_id: uuid.UUID | None,
        current_user: User,
    ) -> Student:
        course = self._resolve_course(course_id=course_id, current_user=current_user)

        self._validate_uniqueness(
            email=email,
            cpf=cpf,
            registration_number=registration_number,
        )

        clean_cpf = self._only_digits(cpf)
        initial_password = f"FEPI{clean_cpf}"

        user = User(
            email=email,
            username=registration_number,
            password_hash=hash_password(initial_password),
            role=UserRole.STUDENT,
            is_active=True,
            must_change_password=True,
        )

        self.db.add(user)
        self.db.flush()

        student = Student(
            user_id=user.id,
            course_id=course.id,
            name=name,
            cpf=clean_cpf,
            registration_number=registration_number,
            enrollment_date=enrollment_date,
            expected_graduation_date=expected_graduation_date,
            is_active=True,
        )

        self.db.add(student)
        self.db.commit()
        self.db.refresh(student)

        return student

    def _resolve_course(
        self,
        *,
        course_id: uuid.UUID | None,
        current_user: User,
    ) -> Course:
        if current_user.role == UserRole.ROOT:
            if course_id is None:
                raise StudentRegistrationError(
                    "course_id é obrigatório quando o cadastro é feito por ROOT."
                )

            course = self.db.scalar(select(Course).where(Course.id == course_id))

            if not course:
                raise StudentRegistrationError("Curso informado não encontrado.")

            return course

        course = self.db.scalar(
            select(Course).where(Course.coordinator_id == current_user.id)
        )

        if not course:
            raise StudentRegistrationError(
                "Nenhum curso vinculado a este coordenador."
            )

        if course_id is not None and course_id != course.id:
            raise StudentRegistrationError(
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

        existing_email = self.db.scalar(select(User).where(User.email == email))
        if existing_email:
            raise StudentRegistrationError("Já existe um usuário com este email.")

        existing_registration = self.db.scalar(
            select(Student).where(Student.registration_number == registration_number)
        )
        if existing_registration:
            raise StudentRegistrationError(
                "Já existe um aluno com esta matrícula."
            )

        existing_cpf = self.db.scalar(
            select(Student).where(Student.cpf == clean_cpf)
        )
        if existing_cpf:
            raise StudentRegistrationError("Já existe um aluno com este CPF.")

        existing_username = self.db.scalar(
            select(User).where(User.username == registration_number)
        )
        if existing_username:
            raise StudentRegistrationError(
                "Já existe um usuário com este nome de usuário (matrícula)."
            )

    @staticmethod
    def _only_digits(value: str) -> str:
        return re.sub(r"\D", "", value)