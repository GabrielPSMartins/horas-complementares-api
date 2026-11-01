import uuid
from types import SimpleNamespace

import pytest

from app.core.exceptions import BusinessRuleError
from app.services.activity_review_service import ActivityReviewService


class FakeHoursService:
    def __init__(self, total_approved: int = 0, approved_by_type: int = 0):
        self.total_approved = total_approved
        self.approved_by_type = approved_by_type

    def get_total_approved_hours(self, student_id: uuid.UUID) -> int:
        return self.total_approved

    def get_approved_hours_by_type(self, student_id: uuid.UUID, activity_type_id: uuid.UUID) -> int:
        return self.approved_by_type


def make_service(**hours) -> ActivityReviewService:
    service = ActivityReviewService(db=None)
    service.hours_service = FakeHoursService(**hours)
    return service


def make_request(
    *,
    requested_hours: int = 50,
    max_hours_per_request: int = 50,
    max_hours_total: int | None = None,
    total_required_hours: int = 200,
    max_extra_hours: int = 10,
) -> SimpleNamespace:
    return SimpleNamespace(
        student_id=uuid.uuid4(),
        activity_type_id=uuid.uuid4(),
        requested_hours=requested_hours,
        activity_type=SimpleNamespace(
            max_hours_per_request=max_hours_per_request,
            max_hours_total=max_hours_total,
        ),
        student=SimpleNamespace(
            course=SimpleNamespace(
                total_required_hours=total_required_hours,
                max_extra_hours=max_extra_hours,
            )
        ),
    )


def test_approval_within_course_limit_is_allowed() -> None:
    service = make_service(total_approved=190)

    service._validate_approval(make_request(), accepted_hours=20)


def test_approval_reaching_exactly_course_limit_is_allowed() -> None:
    service = make_service(total_approved=200)

    service._validate_approval(make_request(), accepted_hours=10)


def test_approval_exceeding_course_limit_is_rejected() -> None:
    service = make_service(total_approved=195)

    with pytest.raises(BusinessRuleError, match="Máximo aceitável agora: 15h"):
        service._validate_approval(make_request(), accepted_hours=20)


def test_approval_when_course_limit_already_reached_is_rejected() -> None:
    service = make_service(total_approved=210)

    with pytest.raises(BusinessRuleError, match="já atingiu o limite de horas do curso"):
        service._validate_approval(make_request(), accepted_hours=1)


def test_approval_exceeding_activity_type_limit_is_rejected() -> None:
    service = make_service(total_approved=0, approved_by_type=40)

    with pytest.raises(BusinessRuleError, match="limite total deste tipo"):
        service._validate_approval(make_request(max_hours_total=50), accepted_hours=20)


def test_approval_exceeding_per_request_limit_is_rejected() -> None:
    service = make_service()

    with pytest.raises(BusinessRuleError, match="limite por certificado"):
        service._validate_approval(
            make_request(requested_hours=60, max_hours_per_request=50),
            accepted_hours=60,
        )
