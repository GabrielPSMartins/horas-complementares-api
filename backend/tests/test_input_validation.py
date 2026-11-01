import io
from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.services.storage import MinioStorageService, get_storage_service
from tests.conftest import client_as, make_request, make_student, make_user

PDF = b"%PDF-1.4 certificado"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 20
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 20
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"0" * 20


class ValidatingStorage(MinioStorageService):
    """Usa a validação real de arquivos do MinioStorageService, sem acessar o MinIO."""

    def __init__(self):
        self.uploaded: list[str] = []

    def ensure_bucket_exists(self) -> None:
        pass

    def upload_certificate(self, *, file, student_id) -> str:
        self._validate_file(file)
        self.uploaded.append(file.filename)
        return f"certificates/{student_id}/{file.filename}"


@pytest.fixture
def storage() -> ValidatingStorage:
    fake = ValidatingStorage()
    app.dependency_overrides[get_storage_service] = lambda: fake
    return fake


@pytest.fixture
def scenario(db: Session) -> dict:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    course = Course(name="SI", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    db.add(course)
    db.flush()
    with_attachment = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    without_attachment = ActivityType(course_id=course.id, name="Monitoria", description="", max_hours_per_request=50, requires_attachment=False, is_active=True)
    db.add_all([with_attachment, without_attachment])
    db.flush()
    student = make_student(db, course, "Ana", "001", 3)
    db.commit()
    return {
        "coordinator": coordinator,
        "student_user": db.get(User, student.user_id),
        "student": student,
        "type": with_attachment,
        "type_without_attachment": without_attachment,
    }


def post_request(db, scenario, *, file=("cert.pdf", PDF, "application/pdf"), **overrides):
    data = {
        "activity_type_id": str(scenario["type"].id),
        "title": "Curso de Python",
        "requested_hours": "10",
        "location": "Online",
        "activity_date": "2026-09-15",
    }
    data.update(overrides)
    files = {"file": (file[0], io.BytesIO(file[1]), file[2])} if file else None
    return client_as(db, scenario["student_user"]).post("/activity-requests", data=data, files=files)


# ---------- criação de solicitação ----------

@pytest.mark.parametrize("field,value", [
    ("title", "x" * 256),
    ("title", "   "),
    ("title", "ab"),
    ("location", "y" * 256),
    ("location", "  "),
    ("description", "z" * 2001),
    ("requested_hours", "1001"),
])
def test_invalid_text_and_hours_are_rejected_with_readable_message(db: Session, scenario: dict, storage: ValidatingStorage, field: str, value: str) -> None:
    response = post_request(db, scenario, **{field: value})

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert storage.uploaded == []


def test_text_fields_are_trimmed(db: Session, scenario: dict, storage: ValidatingStorage) -> None:
    response = post_request(db, scenario, title="  Curso de Python  ", location=" Online ", description="   ")

    assert response.status_code == 201
    assert response.json()["title"] == "Curso de Python"
    assert response.json()["location"] == "Online"
    assert response.json()["description"] is None


def test_future_activity_date_is_rejected(db: Session, scenario: dict, storage: ValidatingStorage) -> None:
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    response = post_request(db, scenario, activity_date=tomorrow)

    assert response.status_code == 422
    assert response.json() == {"detail": "A data da atividade não pode ser futura."}


def test_hours_above_type_limit_are_rejected_on_creation(db: Session, scenario: dict, storage: ValidatingStorage) -> None:
    response = post_request(db, scenario, requested_hours="60")

    assert response.status_code == 422
    assert response.json() == {"detail": "As horas solicitadas ultrapassam o limite por certificado deste tipo de atividade (50h)."}
    assert storage.uploaded == []


@pytest.mark.parametrize("name,content,content_type", [
    ("cert.pdf", b"MZ\x90\x00 executavel", "application/pdf"),
    ("foto.png", PDF, "image/png"),
    ("foto.jpg", b"GIF89a....", "image/jpeg"),
    ("foto.webp", b"RIFF\x24\x00\x00\x00AVI LIST", "image/webp"),
])
def test_file_content_must_match_declared_type(db: Session, scenario: dict, storage: ValidatingStorage, name, content, content_type) -> None:
    response = post_request(db, scenario, file=(name, content, content_type))

    assert response.status_code == 400
    assert response.json() == {"detail": "O conteúdo do arquivo não corresponde ao tipo informado. Envie PDF, JPG, PNG ou WEBP."}


@pytest.mark.parametrize("name,content,content_type", [
    ("cert.pdf", PDF, "application/pdf"),
    ("foto.png", PNG, "image/png"),
    ("foto.jpg", JPEG, "image/jpeg"),
    ("foto.webp", WEBP, "image/webp"),
])
def test_valid_files_are_accepted(db: Session, scenario: dict, storage: ValidatingStorage, name, content, content_type) -> None:
    response = post_request(db, scenario, file=(name, content, content_type))

    assert response.status_code == 201


def test_attachment_required_by_activity_type(db: Session, scenario: dict, storage: ValidatingStorage) -> None:
    response = post_request(db, scenario, file=None)

    assert response.status_code == 422
    assert response.json() == {"detail": "Este tipo de atividade exige o envio do certificado."}


def test_attachment_optional_when_activity_type_does_not_require_it(db: Session, scenario: dict, storage: ValidatingStorage) -> None:
    response = post_request(db, scenario, file=None, activity_type_id=str(scenario["type_without_attachment"].id))

    assert response.status_code == 201
    assert response.json()["attachments"] == []
    assert storage.uploaded == []


# ---------- revisão ----------

def test_blank_rejection_reason_is_rejected(db: Session, scenario: dict) -> None:
    request = make_request(db, scenario["student"], scenario["type"], ActivityRequestStatus.IN_REVIEW, None)
    db.commit()

    response = client_as(db, scenario["coordinator"]).patch(
        f"/activity-requests/{request.id}/review",
        json={"status": "REJECTED", "rejection_reason": "    "},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Informe o motivo da rejeição."}


def test_rejection_reason_is_trimmed_and_limited(db: Session, scenario: dict) -> None:
    request = make_request(db, scenario["student"], scenario["type"], ActivityRequestStatus.IN_REVIEW, None)
    db.commit()
    client = client_as(db, scenario["coordinator"])

    too_long = client.patch(f"/activity-requests/{request.id}/review", json={"status": "REJECTED", "rejection_reason": "x" * 2001})
    ok = client.patch(f"/activity-requests/{request.id}/review", json={"status": "REJECTED", "rejection_reason": "  Ilegível.  "})

    assert too_long.status_code == 422
    assert isinstance(too_long.json()["detail"], str)
    assert ok.status_code == 200
    assert db.scalar(select(ActivityRequest.rejection_reason).where(ActivityRequest.id == request.id)) == "Ilegível."


# ---------- cadastro ----------

def student_payload(**overrides) -> dict:
    payload = {
        "first_name": "Bruno",
        "last_name": "Souza",
        "email": "bruno@fepi.edu.br",
        "cpf": "529.982.247-25",
        "registration_number": "00012345",
        "current_semester": 1,
        "enrollment_date": "2026-02-01",
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize("cpf", ["abc", "123", "529.982.247-26", "111.111.111-11", "5299822472500"])
def test_invalid_cpf_is_rejected(db: Session, scenario: dict, cpf: str) -> None:
    response = client_as(db, scenario["coordinator"]).post("/students", json=student_payload(cpf=cpf))

    assert response.status_code == 422
    assert "CPF" in response.json()["detail"]


@pytest.mark.parametrize("registration", ["", "  ", "ab", "000 123", "x" * 51])
def test_invalid_registration_number_is_rejected(db: Session, scenario: dict, registration: str) -> None:
    response = client_as(db, scenario["coordinator"]).post("/students", json=student_payload(registration_number=registration))

    assert response.status_code == 422


def test_valid_registration_is_normalized(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).post(
        "/students",
        json=student_payload(cpf="529.982.247-25", registration_number=" 00012345 ", first_name="  Bruno "),
    )

    assert response.status_code == 201
    student = db.scalar(select(Student).where(Student.registration_number == "00012345"))
    assert student.cpf == "52998224725"
    assert student.first_name == "Bruno"


def test_coordinator_registration_validates_cpf(db: Session, scenario: dict) -> None:
    root = make_user(db, "root", UserRole.ROOT)
    course = db.scalar(select(Course))
    db.commit()

    response = client_as(db, root).post("/coordinators", json={
        "first_name": "Carla", "last_name": "Lima", "email": "carla@fepi.edu.br",
        "cpf": "000.000.000-00", "registration_number": "C-002", "course_id": str(course.id),
    })

    assert response.status_code == 422
    assert "CPF" in response.json()["detail"]
