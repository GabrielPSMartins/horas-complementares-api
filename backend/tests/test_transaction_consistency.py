import io
import uuid
from datetime import date

import pytest
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from app.core.exceptions import ConflictError
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_request import ActivityRequest
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.services.activity_request_creation_service import ActivityRequestCreationService
from app.services.student_registration_service import StudentRegistrationService
from tests.conftest import client_as, make_student, make_user


class RecordingStorage:
    def __init__(self):
        self.uploaded: list[str] = []
        self.removed: list[str] = []

    def upload_certificate(self, *, file, student_id) -> str:
        name = f"certificates/{student_id}/{file.filename}"
        self.uploaded.append(name)
        return name

    def remove_certificate(self, object_name: str) -> None:
        self.removed.append(object_name)


@pytest.fixture
def scenario(db: Session) -> dict:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    course = Course(name="SI", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    db.add(course)
    db.flush()
    activity_type = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    db.add(activity_type)
    db.flush()
    student = make_student(db, course, "Ana", "001", 3)
    db.commit()
    return {"coordinator": coordinator, "student": student, "activity_type": activity_type}


def upload() -> UploadFile:
    return UploadFile(file=io.BytesIO(b"%PDF-1.4"), filename="cert.pdf", headers=Headers({"content-type": "application/pdf"}))


def test_database_failure_after_upload_removes_file_and_rolls_back(db: Session, scenario: dict, monkeypatch) -> None:
    storage = RecordingStorage()
    service = ActivityRequestCreationService(db, storage)

    def failing_commit():
        raise RuntimeError("banco indisponível")

    monkeypatch.setattr(db, "commit", failing_commit)

    with pytest.raises(RuntimeError):
        service.create(
            student=scenario["student"],
            activity_type_id=scenario["activity_type"].id,
            title="Curso",
            requested_hours=10,
            location="Online",
            activity_date=date(2026, 9, 1),
            description=None,
            file=upload(),
        )

    monkeypatch.undo()
    assert storage.removed == storage.uploaded != []
    assert db.scalar(select(func.count(ActivityRequest.id))) == 0
    assert db.scalar(select(func.count(ActivityAttachment.id))) == 0


def student_payload(**overrides) -> dict:
    payload = {
        "first_name": "Bruno",
        "last_name": "Souza",
        "email": "bruno.souza@fepi.edu.br",
        "cpf": "123.456.789-09",
        "registration_number": "002",
        "current_semester": 1,
        "enrollment_date": "2026-02-01",
    }
    payload.update(overrides)
    return payload


def test_registration_stores_normalized_email(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).post("/students", json=student_payload(email="  Bruno.Souza@FEPI.edu.br "))

    assert response.status_code == 201
    assert response.json()["email"] == "bruno.souza@fepi.edu.br"
    assert db.scalar(select(User.email).where(User.username == "002")) == "bruno.souza@fepi.edu.br"


def test_registration_rejects_same_email_with_different_case(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["coordinator"])
    assert client.post("/students", json=student_payload()).status_code == 201

    response = client.post("/students", json=student_payload(email="BRUNO.SOUZA@fepi.edu.br", cpf="987.654.321-00", registration_number="003"))

    assert response.status_code == 409
    assert response.json() == {"detail": "Já existe um usuário com este email."}


def test_concurrent_duplicate_returns_409_and_rolls_back(db: Session, scenario: dict, monkeypatch) -> None:
    # Simula a corrida: outra requisição gravou o mesmo CPF entre a checagem e o INSERT.
    scenario["student"].cpf = "52998224725"
    db.commit()
    monkeypatch.setattr(StudentRegistrationService, "_validate_uniqueness", lambda self, **kwargs: None)
    client = client_as(db, scenario["coordinator"])

    response = client.post("/students", json=student_payload(cpf="529.982.247-25"))

    assert response.status_code == 409
    assert "Já existe um cadastro" in response.json()["detail"]
    assert db.scalar(select(func.count(Student.id))) == 1
    assert db.scalar(select(func.count(User.id)).where(User.username == "002")) == 0


def coordinator_payload(course_id, **overrides) -> dict:
    payload = {
        "first_name": "Carla",
        "last_name": "Lima",
        "email": "Carla.Lima@FEPI.edu.br",
        "cpf": "222.333.444-05",
        "registration_number": "C-002",
        "course_id": str(course_id),
    }
    payload.update(overrides)
    return payload


def test_coordinator_registration_normalizes_email_and_rejects_case_duplicate(db: Session, scenario: dict) -> None:
    root = make_user(db, "root", UserRole.ROOT)
    course = db.scalar(select(Course))
    db.commit()
    client = client_as(db, root)

    created = client.post("/coordinators", json=coordinator_payload(course.id))
    assert created.status_code == 201
    assert created.json()["email"] == "carla.lima@fepi.edu.br"

    duplicate = client.post("/coordinators", json=coordinator_payload(course.id, email="CARLA.LIMA@fepi.edu.br", cpf="999.888.777-14", registration_number="C-003"))
    assert duplicate.status_code == 409


def test_coordinator_concurrent_duplicate_returns_409(db: Session, scenario: dict, monkeypatch) -> None:
    from app.services.coordinator_registration_service import CoordinatorRegistrationService

    root = make_user(db, "root", UserRole.ROOT)
    course = db.scalar(select(Course))
    db.commit()
    monkeypatch.setattr(CoordinatorRegistrationService, "_validate_uniqueness", lambda self, **kwargs: None)

    response = client_as(db, root).post("/coordinators", json=coordinator_payload(course.id, email="coord@fepi.edu.br", registration_number="coord"))

    assert response.status_code == 409
    assert db.scalar(select(Course.coordinator_id)) == scenario["coordinator"].id
