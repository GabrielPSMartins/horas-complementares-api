import uuid

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies.auth import require_roles
from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.db.dependencies import get_db
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole


def get_current_student(
    current_user: User = Depends(require_roles(UserRole.STUDENT)),
    db: Session = Depends(get_db),
) -> Student:
    """Perfil de aluno do usuário logado, com o curso carregado."""
    student = db.scalar(
        select(Student)
        .options(selectinload(Student.course), selectinload(Student.user))
        .where(Student.user_id == current_user.id)
    )

    if not student:
        raise NotFoundError("Perfil de aluno não encontrado.")

    return student


def get_coordinator_course(
    current_user: User = Depends(require_roles(UserRole.COORDINATOR)),
    db: Session = Depends(get_db),
) -> Course:
    """Curso coordenado pelo usuário logado."""
    course = db.scalar(
        select(Course).where(Course.coordinator_id == current_user.id)
    )

    if not course:
        raise NotFoundError("Nenhum curso vinculado a este coordenador.")

    return course


def get_course_student(
    student_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.COORDINATOR)),
    db: Session = Depends(get_db),
) -> Student:
    """Aluno informado na rota, desde que pertença ao curso do coordenador logado."""
    student = db.scalar(
        select(Student)
        .options(selectinload(Student.course))
        .where(Student.id == student_id)
    )

    if not student:
        raise NotFoundError("Aluno não encontrado.")

    if student.course.coordinator_id != current_user.id:
        raise PermissionDeniedError("Você não possui permissão para acessar os dados deste aluno.")

    return student
