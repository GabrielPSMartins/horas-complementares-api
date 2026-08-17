import uuid

from pydantic import BaseModel

from backend.app.models.activity_request import ActivityRequestStatus


class ApprovedHoursByType(BaseModel):
    activity_type_id: uuid.UUID
    activity_type_name: str
    approved_hours: int


class HoursSummaryResponse(BaseModel):
    total_approved_hours: int
    total_required_hours: int
    max_extra_hours: int
    hours_limit: int
    remaining_hours: int
    progress_percentage: float
    has_reached_limit: bool
    requests_by_status: dict[ActivityRequestStatus, int]
    approved_hours_by_type: list[ApprovedHoursByType]