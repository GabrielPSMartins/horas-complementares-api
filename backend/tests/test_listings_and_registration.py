from datetime import date, datetime, timedelta, UTC

import pytest
from sqlalchemy.orm import Session

from app.models.activity_request import ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.user import User, UserRole
from tests.conftest import client_as, make_request, make_student, make_user

S = ActivityRequestStatus


@pytest.fixture
def scenario(db: Session) -> dict:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    other_coordinator = make_user(db, "coord2", UserRole.COORDINATOR)
    root = make_user(db, "root", UserRole.ROOT)
    course = Course(name="SI", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    other_course = Course(name="Direito", code="DIR", total_required_hours=100, max_extra_hours=0, coordinator_id=other_coordinator.id, is_active=True)
    db.add_all([course, other_course])
    db.flush()
    curso = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    palestra = ActivityType(course_id=course.id, name="Palestra", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    inativo = ActivityType(course_id=course.id, name="Antigo", description="", max_hours_per_request=50, requires_attachment=True, is_active=False)
    juri = ActivityType(course_id=other_course.id, name="Júri simulado", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    db.add_all([curso, palestra, inativo, juri])
    db.flush()

    ana = make_student(db, course, "Ana", "001", 3)
    bruno = make_student(db, course, "Bruno", "002", 5)
    requests = {
        "ana_curso_pendente": make_request(db, ana, curso, S.PENDING, None),
        "ana_palestra_aprovada": make_request(db, ana, palestra, S.APPROVED, 10),
        "bruno_curso_rejeitada": make_request(db, bruno, curso, S.REJECTED, 0),
    }
    requests["ana_curso_pendente"].activity_date = date(2026, 3, 10)
    requests["ana_palestra_aprovada"].activity_date = date(2026, 6, 20)
    requests["bruno_curso_rejeitada"].activity_date = date(2026, 8, 5)
    now = datetime.now(UTC)
    for offset, key in enumerate(["ana_curso_pendente", "ana_palestra_aprovada", "bruno_curso_rejeitada"]):
        requests[key].created_at = now - timedelta(minutes=10 - offset)
    db.commit()

    return {
        "coordinator": coordinator, "other_coordinator": other_coordinator, "root": root,
        "course": course, "other_course": other_course,
        "ana_user": db.get(User, ana.user_id),
        "types": {"curso": curso, "palestra": palestra, "juri": juri},
        "requests": requests,
    }


def titles_by_key(scenario: dict, body: dict) -> set[str]:
    ids = {item["id"] for item in body["items"]}
    return {key for key, req in scenario["requests"].items() if str(req.id) in ids}


# ---------- filtros da lista do coordenador ----------

@pytest.mark.parametrize("params,expected", [
    ({}, {"ana_curso_pendente", "ana_palestra_aprovada", "bruno_curso_rejeitada"}),
    ({"status": "APPROVED"}, {"ana_palestra_aprovada"}),
    ({"semester": 5}, {"bruno_curso_rejeitada"}),
    ({"search": "Bruno"}, {"bruno_curso_rejeitada"}),
    ({"search": "001"}, {"ana_curso_pendente", "ana_palestra_aprovada"}),
    ({"start_date": "2026-06-01"}, {"ana_palestra_aprovada", "bruno_curso_rejeitada"}),
    ({"end_date": "2026-06-30"}, {"ana_curso_pendente", "ana_palestra_aprovada"}),
])
def test_coordinator_listing_filters(db: Session, scenario: dict, params: dict, expected: set) -> None:
    body = client_as(db, scenario["coordinator"]).get("/activity-requests/coordinator", params=params).json()

    assert titles_by_key(scenario, body) == expected
    assert body["total"] == len(expected)


def test_coordinator_listing_filter_by_activity_type(db: Session, scenario: dict) -> None:
    body = client_as(db, scenario["coordinator"]).get(
        "/activity-requests/coordinator", params={"activity_type_id": str(scenario["types"]["curso"].id)}
    ).json()

    assert titles_by_key(scenario, body) == {"ana_curso_pendente", "bruno_curso_rejeitada"}


def test_coordinator_listing_is_newest_first_and_paginated(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["coordinator"])

    first = client.get("/activity-requests/coordinator", params={"page": 1, "page_size": 2}).json()
    second = client.get("/activity-requests/coordinator", params={"page": 2, "page_size": 2}).json()

    assert (first["total"], first["total_pages"]) == (3, 2)
    assert [item["id"] for item in first["items"] + second["items"]] == [
        str(scenario["requests"][key].id) for key in ["bruno_curso_rejeitada", "ana_palestra_aprovada", "ana_curso_pendente"]
    ]


def test_other_course_coordinator_sees_nothing(db: Session, scenario: dict) -> None:
    body = client_as(db, scenario["other_coordinator"]).get("/activity-requests/coordinator").json()

    assert body["total"] == 0


@pytest.mark.parametrize("params,expected", [
    ({"status": "PENDING"}, {"ana_curso_pendente"}),
    ({"start_date": "2026-05-01"}, {"ana_palestra_aprovada"}),
])
def test_student_listing_filters(db: Session, scenario: dict, params: dict, expected: set) -> None:
    body = client_as(db, scenario["ana_user"]).get("/activity-requests/me", params=params).json()

    assert titles_by_key(scenario, body) == expected


# ---------- tipos de atividade por perfil ----------

def names(response) -> list[str]:
    return [item["name"] for item in response.json()]


def test_activity_types_by_role(db: Session, scenario: dict) -> None:
    assert names(client_as(db, scenario["ana_user"]).get("/activity-types")) == ["Curso", "Palestra"]
    assert names(client_as(db, scenario["coordinator"]).get("/activity-types")) == ["Curso", "Palestra"]
    assert names(client_as(db, scenario["other_coordinator"]).get("/activity-types")) == ["Júri simulado"]
    assert names(client_as(db, scenario["root"]).get("/activity-types")) == ["Curso", "Júri simulado", "Palestra"]
    assert names(client_as(db, scenario["root"]).get("/activity-types", params={"course_id": str(scenario["other_course"].id)})) == ["Júri simulado"]


def test_activity_types_for_coordinator_without_course_returns_404(db: Session, scenario: dict) -> None:
    lonely = make_user(db, "sem-curso", UserRole.COORDINATOR)
    db.commit()

    assert client_as(db, lonely).get("/activity-types").status_code == 404


# ---------- cadastro de aluno: regras de curso ----------

def student_payload(**overrides) -> dict:
    payload = {
        "first_name": "Carla", "last_name": "Dias", "email": "carla@fepi.edu.br",
        "cpf": "529.982.247-25", "registration_number": "00099999",
        "current_semester": 1, "enrollment_date": "2026-02-01",
    }
    payload.update(overrides)
    return payload


def test_root_must_inform_existing_course(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["root"])

    without_course = client.post("/students", json=student_payload())
    unknown_course = client.post("/students", json=student_payload(course_id="00000000-0000-0000-0000-000000000000"))
    ok = client.post("/students", json=student_payload(course_id=str(scenario["other_course"].id)))

    assert without_course.status_code == 422
    assert unknown_course.status_code == 404
    assert ok.status_code == 201
    assert ok.json()["course_id"] == str(scenario["other_course"].id)


def test_coordinator_registers_only_in_own_course(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["coordinator"])

    other = client.post("/students", json=student_payload(course_id=str(scenario["other_course"].id)))
    own = client.post("/students", json=student_payload())

    assert other.status_code == 403
    assert own.status_code == 201
    assert own.json()["course_id"] == str(scenario["course"].id)
    assert own.json()["username"] == "00099999"


def test_student_cannot_register_students(db: Session, scenario: dict) -> None:
    assert client_as(db, scenario["ana_user"]).post("/students", json=student_payload()).status_code == 403


def test_coordinator_profile(db: Session, scenario: dict) -> None:
    from app.models.coordinator import Coordinator

    db.add(Coordinator(user_id=scenario["coordinator"].id, first_name="Paula", last_name="Reis", cpf="52998224725", registration_number="00000001", is_active=True))
    db.commit()

    body = client_as(db, scenario["coordinator"]).get("/coordinators/me").json()

    assert body["full_name"] == "Paula Reis"
    assert body["course_name"] == "SI"
    assert client_as(db, scenario["other_coordinator"]).get("/coordinators/me").status_code == 404


def test_semester_limit_follows_course_duration(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["coordinator"])

    beyond = client.post("/students", json=student_payload(current_semester=9))

    scenario["course"].total_semesters = 10
    db.commit()
    longer_course = client.post("/students", json=student_payload(current_semester=10))

    assert beyond.status_code == 422
    assert "8 semestres" in beyond.json()["detail"]
    assert longer_course.status_code == 201
    assert longer_course.json()["current_semester"] == 10
