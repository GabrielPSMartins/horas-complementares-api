import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user, require_roles
from app.db.dependencies import get_db
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_report import ActivityReportResponse
from app.schemas.hours_summary import HoursSummaryResponse
from app.schemas.student import StudentCreateRequest, StudentCreateResponse
from app.services.hours_service import HoursService
from app.services.student_registration_service import (
    StudentRegistrationError,
    StudentRegistrationService,
)

router = APIRouter(prefix="/students", tags=["students"])


@router.post(
    "",
    response_model=StudentCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_student(
    payload: StudentCreateRequest,
    current_user: User = Depends(
        require_roles(UserRole.COORDINATOR, UserRole.ROOT)
    ),
    db: Session = Depends(get_db),
) -> Student:
    service = StudentRegistrationService(db)

    try:
        student = service.register(
            name=payload.name,
            email=payload.email,
            cpf=payload.cpf,
            registration_number=payload.registration_number,
            enrollment_date=payload.enrollment_date,
            expected_graduation_date=payload.expected_graduation_date,
            course_id=payload.course_id,
            current_user=current_user,
        )
    except StudentRegistrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return StudentCreateResponse(
        id=student.id,
        user_id=student.user_id,
        name=student.name,
        email=payload.email,
        cpf=student.cpf,
        registration_number=student.registration_number,
        username=student.registration_number,
        course_id=student.course_id,
        enrollment_date=student.enrollment_date,
        created_at=student.created_at,
    )


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