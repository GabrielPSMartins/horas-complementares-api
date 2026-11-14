import uuid

from pydantic import BaseModel, ConfigDict


class ActivityTypeResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    name: str
    description: str | None
    max_hours_per_request: int
    max_hours_total: int | None
    requires_attachment: bool
    is_active: bool

    model_config = ConfigDict(from_attributes=True)