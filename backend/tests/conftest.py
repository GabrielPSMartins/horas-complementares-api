import os
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (registra todos os models no metadata)
from app.api.dependencies.auth import get_current_user
from app.db.base import Base
from app.db.dependencies import get_db
from app.main import app
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole


# Por padrão os testes usam SQLite em memória. Para rodá-los no PostgreSQL,
# aponte TEST_DATABASE_URL para um banco vazio e descartável (as tabelas são
# recriadas a cada teste).
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture
def db() -> Session:
    if TEST_DATABASE_URL:
        engine = create_engine(TEST_DATABASE_URL)
    else:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def make_user(db: Session, username: str, role: UserRole) -> User:
    user = User(
        email=f"{username}@fepi.edu.br",
        username=username,
        password_hash="x",
        role=role,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    return user


def make_student(db: Session, course: Course, first_name: str, registration: str, semester: int) -> Student:
    user = make_user(db, registration, UserRole.STUDENT)
    student = Student(
        user_id=user.id,
        course_id=course.id,
        first_name=first_name,
        last_name="Silva",
        cpf=registration,
        registration_number=registration,
        current_semester=semester,
        enrollment_date=date(2024, 2, 1),
        is_active=True,
    )
    db.add(student)
    db.flush()
    return student


def make_request(db: Session, student: Student, activity_type: ActivityType, status: ActivityRequestStatus, accepted: int | None) -> ActivityRequest:
    activity_request = ActivityRequest(
        student_id=student.id,
        activity_type_id=activity_type.id,
        title="Atividade",
        location="FEPI",
        activity_date=date(2026, 9, 1),
        requested_hours=20,
        accepted_hours=accepted,
        status=status,
    )
    db.add(activity_request)
    db.flush()
    return activity_request


def client_as(db: Session, user: User) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)
