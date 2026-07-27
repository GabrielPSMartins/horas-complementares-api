import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user
from app.db.dependencies import get_db
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_report import ActivityReportResponse
from app.schemas.hours_summary import HoursSummaryResponse
from app.services.hours_service import HoursService

router = APIRouter(prefix="/students", tags=["students"])


@router.get("/me/hours-summary", response_model=HoursSummaryResponse)
def get_my_hours_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HoursSummaryResponse:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem acessar o resumo de horas.",
        )

    student = db.scalar(
        select(Student).where(Student.user_id == current_user.id)
    )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de aluno não encontrado.",
        )

    course = db.scalar(
        select(Course).where(Course.id == student.course_id)
    )

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso do aluno não encontrado.",
        )

    hours_service = HoursService(db)
    summary = hours_service.get_hours_summary(student.id, course)

    return HoursSummaryResponse(**summary)


@router.get("/me/report", response_model=ActivityReportResponse)
def get_my_report(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityReportResponse:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem acessar o próprio relatório.",
        )

    student = db.scalar(
        select(Student).where(Student.user_id == current_user.id)
    )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de aluno não encontrado.",
        )

    course = db.scalar(
        select(Course).where(Course.id == student.course_id)
    )

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso do aluno não encontrado.",
        )

    hours_service = HoursService(db)
    report = hours_service.build_report(student, course)

    return ActivityReportResponse(**report)


@router.get("/{student_id}/report", response_model=ActivityReportResponse)
def get_student_report(
    student_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityReportResponse:
    if current_user.role != UserRole.COORDINATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas coordenadores podem acessar relatórios de outros alunos.",
        )

    student = db.scalar(
        select(Student).where(Student.id == student_id)
    )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aluno não encontrado.",
        )

    course = db.scalar(
        select(Course).where(Course.id == student.course_id)
    )

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso do aluno não encontrado.",
        )

    if course.coordinator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não possui permissão para ver o relatório deste aluno.",
        )

    hours_service = HoursService(db)
    report = hours_service.build_report(student, course)

    return ActivityReportResponse(**report)