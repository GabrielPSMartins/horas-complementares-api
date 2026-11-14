"""
Testes de contrato das rotas de solicitações e de alunos: status HTTP e conteúdo
das respostas para cada perfil. Garantem que refatorações nas rotas não mudem
o comportamento observado pelo frontend.
"""
import io
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_request_history import ActivityRequestHistory
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.user import User, UserRole
from app.services.storage import get_storage_service
from tests.conftest import client_as, make_request, make_student, make_user


class FakeStorage:
    def __init__(self):
        self.uploaded: list[str] = []

    def upload_certificate(self, *, file, student_id) -> str:
        object_name = f"certificates/{student_id}/{file.filename}"
        self.uploaded.append(object_name)
        return object_name

    def generate_download_url(self, *, object_name: str, file_name: str) -> str:
        return f"http://minio.local/{object_name}?assinado"


@pytest.fixture
def storage() -> FakeStorage:
    fake = FakeStorage()
    app.dependency_overrides[get_storage_service] = lambda: fake
    return fake


@pytest.fixture
def scenario(db: Session) -> dict:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    other_coordinator = make_user(db, "coord2", UserRole.COORDINATOR)

    course = Course(name="Sistemas de Informação", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    other_course = Course(name="Direito", code="DIR", total_required_hours=100, max_extra_hours=0, coordinator_id=other_coordinator.id, is_active=True)
    db.add_all([course, other_course])
    db.flush()

    activity_type = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    other_type = ActivityType(course_id=other_course.id, name="Júri", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    db.add_all([activity_type, other_type])
    db.flush()

    ana = make_student(db, course, "Ana", "001", 3)
    bruno = make_student(db, course, "Bruno", "002", 5)
    approved = make_request(db, ana, activity_type, ActivityRequestStatus.APPROVED, 20)
    attachment = ActivityAttachment(activity_request_id=approved.id, file_name="cert.pdf", file_url="certificates/a/cert.pdf", content_type="application/pdf", size_bytes=10)
    db.add(attachment)
    db.add(ActivityRequestHistory(activity_request_id=approved.id, changed_by_id=ana.user_id, previous_status=None, new_status=ActivityRequestStatus.PENDING, comment="Solicitação criada pelo aluno."))
    db.commit()

    return {
        "coordinator": coordinator,
        "other_coordinator": other_coordinator,
        "ana": ana,
        "ana_user": db.get(User, ana.user_id),
        "bruno_user": db.get(User, bruno.user_id),
        "activity_type": activity_type,
        "other_type": other_type,
        "approved": approved,
        "attachment": attachment,
    }


def create_form(activity_type_id, requested_hours=10) -> dict:
    return {
        "data": {
            "activity_type_id": str(activity_type_id),
            "title": "Curso de Python",
            "requested_hours": str(requested_hours),
            "location": "Online",
            "activity_date": "2026-09-15",
            "description": "Curso online",
        },
        "files": {"file": ("cert.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
    }


# ---------- POST /activity-requests ----------

def test_student_creates_request_with_attachment_and_history(db: Session, scenario: dict, storage: FakeStorage) -> None:
    response = client_as(db, scenario["ana_user"]).post("/activity-requests", **create_form(scenario["activity_type"].id))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["requested_hours"] == 10
    assert body["accepted_hours"] is None
    assert [a["file_name"] for a in body["attachments"]] == ["cert.pdf"]
    assert storage.uploaded == [f"certificates/{scenario['ana'].id}/cert.pdf"]

    history = db.scalars(select(ActivityRequestHistory).where(ActivityRequestHistory.activity_request_id == uuid.UUID(body["id"]))).all()
    assert [(h.previous_status, h.new_status, h.changed_by_id) for h in history] == [(None, ActivityRequestStatus.PENDING, scenario["ana_user"].id)]


def test_create_request_with_type_from_other_course_returns_404(db: Session, scenario: dict, storage: FakeStorage) -> None:
    response = client_as(db, scenario["ana_user"]).post("/activity-requests", **create_form(scenario["other_type"].id))

    assert response.status_code == 404
    assert response.json() == {"detail": "Tipo de atividade não encontrado para o curso do aluno."}
    assert storage.uploaded == []


def test_create_request_with_zero_hours_is_rejected(db: Session, scenario: dict, storage: FakeStorage) -> None:
    response = client_as(db, scenario["ana_user"]).post("/activity-requests", **create_form(scenario["activity_type"].id, requested_hours=0))

    assert response.status_code == 422
    assert response.json() == {"detail": "A quantidade de horas deve ser maior que zero."}
    assert storage.uploaded == []


def test_create_request_when_course_limit_reached_returns_422(db: Session, scenario: dict, storage: FakeStorage) -> None:
    make_request(db, scenario["ana"], scenario["activity_type"], ActivityRequestStatus.APPROVED, 190)
    db.commit()

    response = client_as(db, scenario["ana_user"]).post("/activity-requests", **create_form(scenario["activity_type"].id))

    assert response.status_code == 422
    assert "limite de horas complementares do curso" in response.json()["detail"]
    assert storage.uploaded == []


def test_coordinator_cannot_create_request(db: Session, scenario: dict, storage: FakeStorage) -> None:
    response = client_as(db, scenario["coordinator"]).post("/activity-requests", **create_form(scenario["activity_type"].id))

    assert response.status_code == 403


# ---------- listagens por perfil ----------

def test_my_requests_is_only_for_students(db: Session, scenario: dict) -> None:
    assert client_as(db, scenario["ana_user"]).get("/activity-requests/me").json()["total"] == 1
    assert client_as(db, scenario["coordinator"]).get("/activity-requests/me").status_code == 403


def test_coordinator_listing_is_only_for_coordinators(db: Session, scenario: dict) -> None:
    body = client_as(db, scenario["coordinator"]).get("/activity-requests/coordinator").json()
    assert body["total"] == 1
    assert body["items"][0]["student_name"] == "Ana Silva"
    assert client_as(db, scenario["ana_user"]).get("/activity-requests/coordinator").status_code == 403


# ---------- detalhe, histórico e anexo ----------

@pytest.mark.parametrize("path", ["", "/history"])
def test_request_detail_and_history_permissions(db: Session, scenario: dict, path: str) -> None:
    url = f"/activity-requests/{scenario['approved'].id}{path}"

    assert client_as(db, scenario["ana_user"]).get(url).status_code == 200
    assert client_as(db, scenario["coordinator"]).get(url).status_code == 200
    assert client_as(db, scenario["bruno_user"]).get(url).status_code == 403
    assert client_as(db, scenario["other_coordinator"]).get(url).status_code == 403
    assert client_as(db, scenario["ana_user"]).get(f"/activity-requests/{uuid.uuid4()}{path}").status_code == 404


def test_history_is_sorted_and_named(db: Session, scenario: dict) -> None:
    body = client_as(db, scenario["coordinator"]).get(f"/activity-requests/{scenario['approved'].id}/history").json()

    assert [item["new_status"] for item in body] == ["PENDING"]
    assert body[0]["changed_by_name"] == "Ana Silva"


def test_coordinator_detail_includes_student_fields(db: Session, scenario: dict) -> None:
    coordinator_view = client_as(db, scenario["coordinator"]).get(f"/activity-requests/{scenario['approved'].id}").json()
    student_view = client_as(db, scenario["ana_user"]).get(f"/activity-requests/{scenario['approved'].id}").json()

    assert coordinator_view["student_name"] == "Ana Silva"
    assert "student_name" not in student_view


def test_attachment_download_permissions(db: Session, scenario: dict, storage: FakeStorage) -> None:
    url = f"/activity-requests/{scenario['approved'].id}/attachments/{scenario['attachment'].id}/download"

    response = client_as(db, scenario["ana_user"]).get(url)
    assert response.status_code == 200
    assert response.json()["url"] == "http://minio.local/certificates/a/cert.pdf?assinado"
    assert response.json()["expires_in_seconds"] == 300

    assert client_as(db, scenario["coordinator"]).get(url).status_code == 200
    assert client_as(db, scenario["bruno_user"]).get(url).status_code == 403
    wrong_attachment = f"/activity-requests/{scenario['approved'].id}/attachments/{uuid.uuid4()}/download"
    assert client_as(db, scenario["ana_user"]).get(wrong_attachment).status_code == 404


def test_cancel_is_only_for_students(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).patch(f"/activity-requests/{scenario['approved'].id}/cancel")

    assert response.status_code == 403


# ---------- relatórios e resumo do aluno ----------

@pytest.mark.parametrize("path", ["/students/me/hours-summary", "/students/me/report", "/students/me/report/pdf"])
def test_student_own_endpoints(db: Session, scenario: dict, path: str) -> None:
    response = client_as(db, scenario["ana_user"]).get(path)

    assert response.status_code == 200
    assert client_as(db, scenario["coordinator"]).get(path).status_code == 403


def test_student_own_report_content(db: Session, scenario: dict) -> None:
    summary = client_as(db, scenario["ana_user"]).get("/students/me/hours-summary").json()
    report = client_as(db, scenario["ana_user"]).get("/students/me/report").json()
    pdf = client_as(db, scenario["ana_user"]).get("/students/me/report/pdf")

    assert summary["total_approved_hours"] == 20
    assert summary["hours_limit"] == 210
    assert report["student"]["name"] == "Ana Silva"
    assert report["course"]["name"] == "Sistemas de Informação"
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"] == 'attachment; filename="relatorio-horas-001.pdf"'
    assert pdf.content.startswith(b"%PDF")


@pytest.mark.parametrize("suffix", ["/report", "/report/pdf"])
def test_coordinator_student_report_permissions(db: Session, scenario: dict, suffix: str) -> None:
    url = f"/students/{scenario['ana'].id}{suffix}"

    assert client_as(db, scenario["coordinator"]).get(url).status_code == 200
    assert client_as(db, scenario["other_coordinator"]).get(url).status_code == 403
    assert client_as(db, scenario["ana_user"]).get(url).status_code == 403
    assert client_as(db, scenario["coordinator"]).get(f"/students/{uuid.uuid4()}{suffix}").status_code == 404


def test_coordinator_dashboard(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).get("/coordinator/dashboard")

    assert response.status_code == 200
    assert response.json()["requests_by_status"]["APPROVED"] == 1
    assert response.json()["total_active_students"] == 2
    assert client_as(db, scenario["coordinator"]).get("/coordinator/dashboard", params={"semester": 5}).json()["total_active_students"] == 1
    assert client_as(db, scenario["ana_user"]).get("/coordinator/dashboard").status_code == 403


# ---------- observabilidade ----------

def test_request_id_is_reused_from_client_or_generated(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["coordinator"])

    reused = client.get("/auth/me", headers={"X-Request-ID": "demo-123"})
    replaced = client.get("/auth/me", headers={"X-Request-ID": "<script>"})

    assert reused.headers["X-Request-ID"] == "demo-123"
    assert replaced.headers["X-Request-ID"] not in ("<script>", "")


def test_review_is_logged_with_request_id(db: Session, scenario: dict, caplog) -> None:
    from app.core.request_context import RequestIdFilter

    caplog.handler.addFilter(RequestIdFilter())
    client = client_as(db, scenario["coordinator"])
    pending = make_request(db, scenario["ana"], scenario["activity_type"], ActivityRequestStatus.PENDING, None)

    with caplog.at_level("INFO", logger="app.services.activity_review_service"):
        client.patch(f"/activity-requests/{pending.id}/assume", headers={"X-Request-ID": "review-1"})

    records = [r for r in caplog.records if r.getMessage().startswith("activity_request_assumed")]
    assert len(records) == 1
    assert records[0].request_id == "review-1"
    assert str(pending.id) in records[0].getMessage()
