import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.activity_request import ActivityRequestStatus


class ActivityRequestHistoryResponse(BaseModel):
    id: uuid.UUID
    changed_by_id: uuid.UUID | None
    previous_status: ActivityRequestStatus | None
    new_status: ActivityRequestStatus | None
    previous_accepted_hours: int | None
    new_accepted_hours: int | None
    comment: str | None
    created_at: datetime

    class Config:
        from_attributes = True