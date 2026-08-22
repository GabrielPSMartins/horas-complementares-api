import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.hours_summary import HoursSummaryResponse


class ReportStudentInfo(BaseModel):
    name: str
    email: str | None
    cpf: str
    registration_number: str
    enrollment_date: date


class ReportCourseInfo(BaseModel):
    name: str
    code: str
    total_required_hours: int
    max_extra_hours: int


class ReportApprovedActivity(BaseModel):
    title: str
    activity_type_name: str
    accepted_hours: int | None
    activity_date: date
    location: str


class ActivityReportResponse(BaseModel):
    student: ReportStudentInfo
    course: ReportCourseInfo
    summary: HoursSummaryResponse
    approved_activities: list[ReportApprovedActivity]