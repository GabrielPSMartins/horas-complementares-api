import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.activity_request import ActivityRequestStatus


class ActivityRequestHistory(Base):
    __tablename__ = "activity_request_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    activity_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activity_requests.id"),
        nullable=False,
    )

    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    previous_status: Mapped[ActivityRequestStatus | None] = mapped_column(
        Enum(ActivityRequestStatus, name="activity_request_status"),
        nullable=True,
    )
    new_status: Mapped[ActivityRequestStatus | None] = mapped_column(
        Enum(ActivityRequestStatus, name="activity_request_status"),
        nullable=True,
    )

    previous_accepted_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_accepted_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    activity_request = relationship(
        "ActivityRequest",
        back_populates="history_items",
    )

    changed_by = relationship(
        "User",
        back_populates="activity_request_history_items",
    )