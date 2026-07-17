from app.api.routes import health


def test_health_check(monkeypatch) -> None:
    monkeypatch.setattr(health, "check_database_connection", lambda: True)

    assert health.health_check() == {
        "status": "ok",
        "app": "running",
        "database": "connected",
    }
