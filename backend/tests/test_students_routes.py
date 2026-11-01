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
    make_student(db, course, "Carla", "003", 3)  # sem nenhuma solicitação
    make_student(db, other_course, "Diego", "004", 1)  # outro curso

    make_request(db, ana, activity_type, ActivityRequestStatus.APPROVED, 30)
    make_request(db, ana, activity_type, ActivityRequestStatus.APPROVED, 20)
    make_request(db, ana, activity_type, ActivityRequestStatus.PENDING, None)
    make_request(db, ana, activity_type, ActivityRequestStatus.REJECTED, 0)
    make_request(db, bruno, activity_type, ActivityRequestStatus.IN_REVIEW, None)
    db.commit()

    return {"coordinator": coordinator, "ana": ana}


def test_list_students_includes_students_without_requests(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).get("/students")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    by_name = {item["first_name"]: item for item in body["items"]}
    assert set(by_name) == {"Ana", "Bruno", "Carla"}

    assert by_name["Ana"]["total_approved_hours"] == 50
    assert by_name["Ana"]["open_requests"] == 1
    assert by_name["Ana"]["progress_percentage"] == 25.0
    assert by_name["Ana"]["email"] == "001@fepi.edu.br"
    assert by_name["Bruno"]["open_requests"] == 1
    assert by_name["Carla"]["total_approved_hours"] == 0
    assert by_name["Carla"]["open_requests"] == 0
    assert by_name["Carla"]["hours_limit"] == 210


def test_list_students_filters_and_paginates(db: Session, scenario: dict) -> None:
    client = client_as(db, scenario["coordinator"])

    by_semester = client.get("/students", params={"semester": 3}).json()
    assert {item["first_name"] for item in by_semester["items"]} == {"Ana", "Carla"}

    by_search = client.get("/students", params={"search": "002"}).json()
    assert [item["first_name"] for item in by_search["items"]] == ["Bruno"]

    first_page = client.get("/students", params={"page": 1, "page_size": 2}).json()
    assert first_page["total"] == 3
    assert first_page["total_pages"] == 2
    assert [item["first_name"] for item in first_page["items"]] == ["Ana", "Bruno"]


def test_list_students_forbidden_for_student(db: Session, scenario: dict) -> None:
    student_user = db.get(User, scenario["ana"].user_id)

    response = client_as(db, student_user).get("/students")

    assert response.status_code == 403


def test_get_my_profile(db: Session, scenario: dict) -> None:
    student_user = db.get(User, scenario["ana"].user_id)

    response = client_as(db, student_user).get("/students/me")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Ana Silva"
    assert body["email"] == "001@fepi.edu.br"
    assert body["course_name"] == "Sistemas de Informação"


def test_get_my_profile_forbidden_for_coordinator(db: Session, scenario: dict) -> None:
    response = client_as(db, scenario["coordinator"]).get("/students/me")

    assert response.status_code == 403
