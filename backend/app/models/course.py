import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utc_now


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("total_semesters >= 1", name="ck_courses_total_semesters_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    total_required_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    max_extra_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    total_semesters: Mapped[int] = mapped_column(Integer, nullable=False, default=8, server_default="8")

    coordinator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    coordinator = relationship(
        "User",
        back_populates="coordinated_courses",
        foreign_keys=[coordinator_id],
    )

    students = relationship(
        "Student",
        back_populates="course",
    )

    activity_types = relationship(
        "ActivityType",
        back_populates="course",
    )