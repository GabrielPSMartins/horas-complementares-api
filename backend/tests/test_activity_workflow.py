"""
Ciclo de vida da solicitação pela API:

    PENDING ──assumir──> IN_REVIEW ──aprovar/rejeitar──> APPROVED | REJECTED
       │                                 (também a partir de PENDING)
       └──cancelar (aluno)──> CANCELED

Cada transição grava uma linha no histórico; APPROVED, REJECTED e CANCELED são finais.
"""
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_request import ActivityRequest, ActivityRequestStatus
from app.models.activity_request_history import ActivityRequestHistory
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.user import User, UserRole
from tests.conftest import client_as, make_request, make_student, make_user

S = ActivityRequestStatus


@pytest.fixture
def scenario(db: Session) -> dict:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    course = Course(name="SI", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    db.add(course)
    db.flush()
    curso = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, max_hours_total=None, requires_attachment=True, is_active=True)
    monitoria = ActivityType(course_id=course.id, name="Monitoria", description="", max_hours_per_request=50, max_hours_total=60, requires_attachment=True, is_active=True)
    db.add_all([curso, monitoria])
    db.flush()
    student = make_student(db, course, "Ana", "001", 3)
    db.commit()
    return {
        "coordinator": coordinator,
        "student": student,
        "student_user": db.get(User, student.user_id),
        "curso": curso,
        "monitoria": monitoria,
    }


def new_request(db: Session, scenario: dict, status=S.PENDING, accepted=None, activity_type="curso", hours=20) -> ActivityRequest:
    request = make_request(db, scenario["student"], scenario[activity_type], status, accepted)
    request.requested_hours = hours
    db.commit()
    return request


def history(db: Session, request: ActivityRequest) -> list[tuple]:
    rows = db.scalars(
        select(ActivityRequestHistory)
        .where(ActivityRequestHistory.activity_request_id == request.id)
        .order_by(ActivityRequestHistory.created_at)
    ).all()
    return [(h.previous_status, h.new_status, h.new_accepted_hours, h.comment) for h in rows]


def review(db, scenario, request, **payload):
    return client_as(db, scenario["coordinator"]).patch(f"/activity-requests/{request.id}/review", json=payload)


# ---------- transições válidas ----------

def test_assume_then_approve_records_reviewer_and_history(db: Session, scenario: dict) -> None:
    request = new_request(db, scenario)
    client = client_as(db, scenario["coordinator"])

    assumed = client.patch(f"/activity-requests/{request.id}/assume")
    approved = review(db, scenario, request, status="APPROVED", accepted_hours=15)

    assert assumed.status_code == 200 and assumed.json()["status"] == "IN_REVIEW"
    assert assumed.json()["in_review_by_id"] == str(scenario["coordinator"].id)
    assert approved.status_code == 200
    body = approved.json()
    assert body["status"] == "APPROVED"
    assert body["accepted_hours"] == 15
    assert body["reviewed_by_id"] == str(scenario["coordinator"].id)
    assert body["reviewed_at"] is not None
    assert history(db, request) == [
        (S.PENDING, S.IN_REVIEW, None, "Assumida para análise pelo coordenador."),
        (S.IN_REVIEW, S.APPROVED, 15, None),
    ]


def test_reject_directly_from_pending_zeroes_hours(db: Session, scenario: dict) -> None:
    request = new_request(db, scenario)

    response = review(db, scenario, request, status="REJECTED", rejection_reason="Certificado ilegível.")

    assert response.status_code == 200
    assert response.json()["accepted_hours"] == 0
    assert response.json()["rejection_reason"] == "Certificado ilegível."
    assert history(db, request) == [(S.PENDING, S.REJECTED, 0, "Certificado ilegível.")]


def test_student_cancels_pending_request(db: Session, scenario: dict) -> None:
    request = new_request(db, scenario)

    response = client_as(db, scenario["student_user"]).patch(f"/activity-requests/{request.id}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "CANCELED"
    assert history(db, request) == [(S.PENDING, S.CANCELED, None, "Cancelado pelo aluno.")]


# ---------- transições proibidas ----------

@pytest.mark.parametrize("final_status", [S.APPROVED, S.REJECTED, S.CANCELED])
def test_final_states_cannot_be_reviewed_assumed_or_canceled(db: Session, scenario: dict, final_status) -> None:
    request = new_request(db, scenario, status=final_status, accepted=10 if final_status == S.APPROVED else None)
    coordinator = client_as(db, scenario["coordinator"])

    assert coordinator.patch(f"/activity-requests/{request.id}/assume").status_code == 409
    assert review(db, scenario, request, status="APPROVED", accepted_hours=5).status_code == 409
    assert client_as(db, scenario["student_user"]).patch(f"/activity-requests/{request.id}/cancel").status_code == 409
    assert history(db, request) == []


def test_review_with_non_final_status_is_rejected(db: Session, scenario: dict) -> None:
    request = new_request(db, scenario)

    response = review(db, scenario, request, status="IN_REVIEW")

    assert response.status_code == 422
    assert response.json() == {"detail": "Status inválido para revisão."}


# ---------- limites de horas na aprovação ----------

@pytest.mark.parametrize("accepted,message", [
    (None, "accepted_hours é obrigatório na aprovação."),
    (0, "accepted_hours deve ser maior que zero."),
    (25, "accepted_hours não pode ser maior que o informado pelo aluno no certificado."),
])
def test_invalid_accepted_hours(db: Session, scenario: dict, accepted, message) -> None:
    request = new_request(db, scenario, hours=20)

    response = review(db, scenario, request, status="APPROVED", accepted_hours=accepted)

    assert response.status_code == 422
    assert response.json() == {"detail": message}


def test_activity_type_total_limit_on_approval(db: Session, scenario: dict) -> None:
    new_request(db, scenario, status=S.APPROVED, accepted=50, activity_type="monitoria", hours=50)
    request = new_request(db, scenario, activity_type="monitoria", hours=20)

    too_much = review(db, scenario, request, status="APPROVED", accepted_hours=20)
    allowed = review(db, scenario, request, status="APPROVED", accepted_hours=10)

    assert too_much.status_code == 422
    assert "Máximo aceitável agora: 10h" in too_much.json()["detail"]
    assert allowed.status_code == 200


def test_course_limit_on_approval_end_to_end(db: Session, scenario: dict) -> None:
    # 195h já aprovadas + três pendentes de 20h: o teto de 210h só comporta mais 15h.
    for _ in range(4):
        new_request(db, scenario, status=S.APPROVED, accepted=48, hours=48)
    new_request(db, scenario, status=S.APPROVED, accepted=3, hours=3)
    pending = [new_request(db, scenario, hours=20) for _ in range(3)]

    first = review(db, scenario, pending[0], status="APPROVED", accepted_hours=20)
    partial = review(db, scenario, pending[0], status="APPROVED", accepted_hours=15)
    after_limit = review(db, scenario, pending[1], status="APPROVED", accepted_hours=1)

    assert first.status_code == 422
    assert "Máximo aceitável agora: 15h" in first.json()["detail"]
    assert partial.status_code == 200
    assert after_limit.status_code == 422
    assert "já atingiu o limite de horas do curso" in after_limit.json()["detail"]
    summary = client_as(db, scenario["student_user"]).get("/students/me/hours-summary").json()
    assert summary["total_approved_hours"] == 210
    assert summary["has_reached_limit"] is True
