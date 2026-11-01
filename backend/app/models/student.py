import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utc_now


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        # O teto depende do curso (Course.total_semesters) e é validado no cadastro.
        CheckConstraint(
            "current_semester >= 1",
            name="ck_students_current_semester_positive",
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
        index=True,
    )

    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False)
    registration_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    current_semester: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_graduation_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def email(self) -> str:
        return self.user.email

    @property
    def username(self) -> str:
        return self.user.username