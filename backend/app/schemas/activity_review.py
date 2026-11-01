from datetime import datetime
from uuid import UUID

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.activity_request import ActivityRequestStatus


class ActivityReviewRequest(BaseModel):
    status: ActivityRequestStatus

    accepted_hours: int | None = Field(
        default=None,
        ge=0,
        le=1000,
    )

    # Espaços nas pontas são removidos; um motivo só com espaços vira vazio
    # e é recusado pelo serviço na rejeição.
    rejection_reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


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

    model_config = ConfigDict(from_attributes=True)