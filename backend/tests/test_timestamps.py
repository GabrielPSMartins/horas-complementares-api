from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import DateTime, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.db.base import Base
from app.models.user import UserRole
from tests.conftest import TEST_DATABASE_URL, make_user

requires_postgres = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="o SQLite não guarda fuso horário; rode com TEST_DATABASE_URL",
)


def test_all_timestamp_defaults_are_timezone_aware() -> None:
    datetime_columns = [
        column
        for table in Base.metadata.sorted_tables
        for column in table.columns
        if isinstance(column.type, DateTime)
    ]
    assert datetime_columns

    for column in datetime_columns:
        for generator in (column.default, column.onupdate):
            if generator is not None and generator.is_callable:
                value = generator.arg(None)
                assert value.tzinfo is not None, f"{column.table.name}.{column.name} gera datetime sem fuso"


@requires_postgres
def test_created_at_is_correct_when_database_session_is_not_utc(db: Session) -> None:
    db.execute(text("SET TIME ZONE 'America/Sao_Paulo'"))

    before = datetime.now(UTC)
    user = make_user(db, "fuso", UserRole.STUDENT)
    db.commit()
    db.refresh(user)

    assert abs(user.created_at - before) < timedelta(minutes=1)
    assert abs(user.updated_at - before) < timedelta(minutes=1)


@requires_postgres
def test_updated_at_on_update_is_correct_when_database_session_is_not_utc(db: Session) -> None:
    db.execute(text("SET TIME ZONE 'America/Sao_Paulo'"))
    user = make_user(db, "atualiza", UserRole.STUDENT)
    db.commit()

    before_update = datetime.now(UTC)
    user.is_active = False
    db.commit()
    db.refresh(user)

    assert abs(user.updated_at - before_update) < timedelta(minutes=1)
