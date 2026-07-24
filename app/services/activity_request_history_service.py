import uuid

from sqlalchemy.orm import Session

from app.models.activity_request import ActivityRequestStatus
from app.models.activity_request_history import ActivityRequestHistory


class ActivityRequestHistoryService:

    def __init__(self, db: Session):
        self.db = db

    def record(
        self,
        *,
        activity_request_id: uuid.UUID,
        changed_by_id: uuid.UUID | None,
        previous_status: ActivityRequestStatus | None,
        new_status: ActivityRequestStatus | None,
        previous_accepted_hours: int | None = None,
        new_accepted_hours: int | None = None,
        comment: str | None = None,
    ) -> ActivityRequestHistory:
        history_entry = ActivityRequestHistory(
            activity_request_id=activity_request_id,
            changed_by_id=changed_by_id,
            previous_status=previous_status,
            new_status=new_status,
            previous_accepted_hours=previous_accepted_hours,
            new_accepted_hours=new_accepted_hours,
            comment=comment,
        )

        self.db.add(history_entry)

        return history_entry