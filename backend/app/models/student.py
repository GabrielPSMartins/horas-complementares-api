import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        CheckConstraint(
            "current_semester >= 1 AND current_semester <= 8",
            name="ck_students_current_semester_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False)
    registration_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    current_semester: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_graduation_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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

    user = relationship(
        "User",
        back_populates="student_profile",
    )

    course = relationship(
        "Course",
        back_populates="students",
    )

    activity_requests = relationship(
        "ActivityRequest",
        back_populates="student",
    )