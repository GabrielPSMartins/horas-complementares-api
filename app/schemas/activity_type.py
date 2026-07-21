import uuid

from pydantic import BaseModel


class ActivityTypeResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    name: str
    description: str | None
    max_hours_per_request: int
    max_hours_total: int | None
    requires_attachment: bool
    is_active: bool

    class Config:
        from_attributes = True