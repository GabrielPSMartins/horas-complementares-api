import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ActivityRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"


class ActivityRequest(Base):
    __tablename__ = "activity_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id"),
        nullable=False,
    )
    activity_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activity_types.id"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    activity_date: Mapped[date] = mapped_column(Date, nullable=False)

    requested_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    accepted_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[ActivityRequestStatus] = mapped_column(
        Enum(ActivityRequestStatus, name="activity_request_status"),
        nullable=False,
        default=ActivityRequestStatus.PENDING,
    )

    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    student = relationship(
        "Student",
        back_populates="activity_requests",
    )

    activity_type = relationship(
        "ActivityType",
        back_populates="activity_requests",
    )

    reviewer = relationship(
        "User",
        back_populates="reviewed_activity_requests",
        foreign_keys=[reviewed_by_id],
    )

    attachments = relationship(
        "ActivityAttachment",
        back_populates="activity_request",
        cascade="all, delete-orphan",
    )

    history_items = relationship(
        "ActivityRequestHistory",
        back_populates="activity_request",
        cascade="all, delete-orphan",
    )