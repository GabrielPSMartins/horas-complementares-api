from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_roles
from app.api.dependencies.profiles import get_coordinator_course, get_course_student, get_current_student
from app.api.responses import error_responses
from app.db.dependencies import get_db
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_report import ActivityReportResponse
from app.schemas.hours_summary import HoursSummaryResponse
from app.schemas.pagination import PaginatedResponse
from app.schemas.student import (
    StudentCreateRequest,
    StudentCreateResponse,
    StudentListItemResponse,
    StudentProfileResponse,
)
from app.services.hours_service import HoursService
from app.services.report_pdf_service import build_report_pdf
from app.services.student_query_service import StudentQueryService
from app.services.student_registration_service import StudentRegistrationService

router = APIRouter(
    prefix="/students",
    tags=["students"],
    responses=error_responses(401, 403),
)


def _pdf_response(pdf_bytes: bytes, registration_number: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="relatorio-horas-{registration_number}.pdf"'
            )
        },
    )


@router.post(
    "",
    response_model=StudentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra um aluno (coordenador ou ROOT)",
    responses=error_responses(404, 409, 422),
)
def create_student(
    payload: StudentCreateRequest,
    current_user: User = Depends(
        require_roles(UserRole.COORDINATOR, UserRole.ROOT)
    ),
    db: Session = Depends(get_db),
) -> StudentCreateResponse:
    student = StudentRegistrationService(db).register(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        cpf=payload.cpf,
        registration_number=payload.registration_number,
        current_semester=payload.current_semester,
        enrollment_date=payload.enrollment_date,
        expected_graduation_date=payload.expected_graduation_date,
        course_id=payload.course_id,
        current_user=current_user,
    )

    return StudentCreateResponse.model_validate(student)


@router.get(
    "",
    response_model=PaginatedResponse[StudentListItemResponse],
    summary="Lista os alunos do curso com o resumo de horas (coordenador)",
    responses=error_responses(404),
)
def list_course_students(
    search: str | None = Query(
        default=None,
        description="Busca por nome ou matrícula do aluno",
    ),
    semester: int | None = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    course: Course = Depends(get_coordinator_course),
    db: Session = Depends(get_db),
) -> PaginatedResponse[StudentListItemResponse]:
    query_service = StudentQueryService(db)

    items, total = query_service.list_by_course(
        course=course,
        search=search,
        semester=semester,
        page=page,
        page_size=page_size,
    )

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=query_service.calculate_total_pages(total, page_size),
    )


@router.get(
    "/me",
    response_model=StudentProfileResponse,
    summary="Perfil do aluno logado",
    responses=error_responses(404),
)
def get_my_profile(
    student: Student = Depends(get_current_student),
) -> StudentProfileResponse:
    return StudentProfileResponse(
        id=student.id,
        name=student.full_name,
        first_name=student.first_name,
        last_name=student.last_name,
        email=student.user.email,
        cpf=student.cpf,
        registration_number=student.registration_number,
        current_semester=student.current_semester,
        enrollment_date=student.enrollment_date,
        expected_graduation_date=student.expected_graduation_date,
        course_id=student.course_id,
        course_name=student.course.name,
    )


@router.get(
    "/me/hours-summary",
    response_model=HoursSummaryResponse,
    summary="Resumo de horas do aluno logado",
    responses=error_responses(404),
)
def get_my_hours_summary(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
) -> HoursSummaryResponse:
    summary = HoursService(db).get_hours_summary(student.id, student.course)

    return HoursSummaryResponse(**summary)


@router.get(
    "/me/report",
    response_model=ActivityReportResponse,
    summary="Relatório de horas aprovadas do aluno logado",
    responses=error_responses(404),
)
def get_my_report(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
) -> ActivityReportResponse:
    report = HoursService(db).build_report(student, student.course)

    return ActivityReportResponse(**report)


@router.get(
    "/me/report/pdf",
    response_class=Response,
    summary="Relatório do aluno logado em PDF",
    responses={200: {"content": {"application/pdf": {}}}, **error_responses(404)},
)
def export_my_report_pdf(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
) -> Response:
    report = HoursService(db).build_report(student, student.course)

    return _pdf_response(build_report_pdf(report), student.registration_number)


@router.get(
    "/{student_id}/report",
    response_model=ActivityReportResponse,
    summary="Relatório de horas de um aluno do curso (coordenador)",
    responses=error_responses(404),
)
def get_student_report(
    student: Student = Depends(get_course_student),
    db: Session = Depends(get_db),
) -> ActivityReportResponse:
    report = HoursService(db).build_report(student, student.course)

    return ActivityReportResponse(**report)


@router.get(
    "/{student_id}/report/pdf",
    response_class=Response,
    summary="Relatório de um aluno do curso em PDF (coordenador)",
    responses={200: {"content": {"application/pdf": {}}}, **error_responses(404)},
)
def export_student_report_pdf(
    student: Student = Depends(get_course_student),
    db: Session = Depends(get_db),
) -> Response:
    report = HoursService(db).build_report(student, student.course)

    return _pdf_response(build_report_pdf(report), student.registration_number)
