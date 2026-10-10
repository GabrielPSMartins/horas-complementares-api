import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.hours_summary import HoursSummaryResponse


class ReportStudentInfo(BaseModel):
    id: uuid.UUID
    name: str
    first_name: str
    last_name: str
    email: str | None
    cpf: str
    registration_number: str
    current_semester: int
    enrollment_date: date


class ReportCourseInfo(BaseModel):
    name: str
    code: str
    total_required_hours: int
    max_extra_hours: int


class ReportApprovedActivity(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    activity_type_name: str
    accepted_hours: int | None
    activity_date: date
    location: str


class ActivityReportResponse(BaseModel):
    generated_at: datetime
    student: ReportStudentInfo
    course: ReportCourseInfo
    summary: HoursSummaryResponse
    approved_activities: list[ReportApprovedActivity]