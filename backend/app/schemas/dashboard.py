from pydantic import BaseModel

from backend.app.models.activity_request import ActivityRequestStatus


class CoordinatorDashboardResponse(BaseModel):
    requests_by_status: dict[ActivityRequestStatus, int]
    total_active_students: int