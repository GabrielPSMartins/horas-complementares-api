import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.activity_request import ActivityRequestStatus


class ActivityAttachmentResponse(BaseModel):
    id: uuid.UUID
    file_name: str
    file_url: str
    content_type: str | None
    size_bytes: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityRequestResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    activity_type_id: uuid.UUID
    title: str
    description: str | None
    location: str
    activity_date: date
    requested_hours: int
    accepted_hours: int | None
    status: ActivityRequestStatus
    rejection_reason: str | None
    reviewed_by_id: uuid.UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    attachments: list[ActivityAttachmentResponse]

    class Config:
        from_attributes = True