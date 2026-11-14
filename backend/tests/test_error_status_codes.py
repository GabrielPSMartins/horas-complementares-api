import uuid

import pytest
from sqlalchemy.orm import Session

from app.models.activity_request import ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.user import User, UserRole
from tests.conftest import client_as, make_request, make_student, make_user


@pytest.fixture
def scenario(db: Session) -> dict:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    other_coordinator = make_user(db, "coord2", UserRole.COORDINATOR)

    course = Course(name="Sistemas de Informação", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    other_course = Course(name="Direito", code="DIR", total_required_hours=100, max_extra_hours=0, coordinator_id=other_coordinator.id, is_active=True)
    db.add_all([course, other_course])
    db.flush()

    activity_type = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    db.add(activity_type)
    db.flush()

    ana = make_student(db, course, "Ana", "001", 3)
    bruno = make_student(db, course, "Bruno", "002", 5)

    scenario = {
        "coordinator": coordinator,
        "other_coordinator": other_coordinator,
        "ana_user": db.get(User, ana.user_id),
        "bruno_user": db.get(User, bruno.user_id),
        "pending": make_request(db, ana, activity_type, ActivityRequestStatus.PENDING, None),
        "in_review": make_request(db, ana, activity_type, ActivityRequestStatus.IN_REVIEW, None),
        "approved": make_request(db, ana, activity_type, ActivityRequestStatus.APPROVED, 20),
    }
    db.commit()
    return scenario


def test_assume_unknown_request_returns_404(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).patch(f"/activity-requests/{uuid.uuid4()}/assume")

    assert response.status_code == 404
    assert response.json() == {"detail": "Solicitação não encontrada."}


def test_assume_request_from_other_course_returns_403(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["other_coordinator"]).patch(f"/activity-requests/{scenario['pending'].id}/assume")

    assert response.status_code == 403


def test_assume_as_student_returns_403(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["ana_user"]).patch(f"/activity-requests/{scenario['pending'].id}/assume")

    assert response.status_code == 403


def test_assume_finished_request_returns_409(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).patch(f"/activity-requests/{scenario['approved'].id}/assume")

    assert response.status_code == 409


def test_assume_pending_request_succeeds(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).patch(f"/activity-requests/{scenario['pending'].id}/assume")

    assert response.status_code == 200
    assert response.json()["status"] == "IN_REVIEW"


def test_review_by_other_course_coordinator_returns_403_before_status_check(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["other_coordinator"]).patch(
        f"/activity-requests/{scenario['approved'].id}/review",
        json={"status": "REJECTED", "rejection_reason": "x"},
    )

    assert response.status_code == 403


def test_review_with_hours_above_requested_returns_422(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).patch(
        f"/activity-requests/{scenario['in_review'].id}/review",
        json={"status": "APPROVED", "accepted_hours": 30},
    )

    assert response.status_code == 422
    assert "não pode ser maior" in response.json()["detail"]


def test_reject_without_reason_returns_422(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).patch(
        f"/activity-requests/{scenario['in_review'].id}/review",
        json={"status": "REJECTED"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Informe o motivo da rejeição."}


def test_cancel_request_of_other_student_returns_403(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["bruno_user"]).patch(f"/activity-requests/{scenario['pending'].id}/cancel")

    assert response.status_code == 403


def test_cancel_request_in_review_returns_409(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["ana_user"]).patch(f"/activity-requests/{scenario['in_review'].id}/cancel")

    assert response.status_code == 409


def test_cancel_unknown_request_returns_404(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["ana_user"]).patch(f"/activity-requests/{uuid.uuid4()}/cancel")

    assert response.status_code == 404


def test_register_student_with_duplicate_email_returns_409(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).post(
        "/students",
        json={
            "first_name": "Outra",
            "last_name": "Ana",
            "email": "001@fepi.edu.br",
            "cpf": "123.456.789-09",
            "registration_number": "999",
            "current_semester": 1,
            "enrollment_date": "2026-02-01",
        },
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Já existe um usuário com este email."}
