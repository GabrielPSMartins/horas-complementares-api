from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.activity_request import ActivityRequestStatus


class ActivityReviewRequest(BaseModel):
    status: ActivityRequestStatus

    accepted_hours: int | None = Field(
        default=None,
        ge=0,
    )

    rejection_reason: str | None = None


class ActivityReviewResponse(BaseModel):
    id: UUID

    status: ActivityRequestStatus

    accepted_hours: int | None

    rejection_reason: str | None

    in_review_by_id: UUID | None

    in_review_by_name: str | None

    in_review_at: datetime | None

    reviewed_by_id: UUID | None

    reviewed_by_name: str | None

    reviewed_at: datetime | None

    class Config:
        from_attributes = True