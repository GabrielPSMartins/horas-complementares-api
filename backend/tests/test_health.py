from fastapi import Response

from app.api.routes import health


def test_health_check(monkeypatch) -> None:
    monkeypatch.setattr(health, "check_database_connection", lambda: True)

    result = health.health_check(Response())

    assert result.status == "ok"
    assert result.app == "running"
    assert result.database == "connected"
