from datetime import timedelta

import pytest

from app.core import security

# Hash de "FEPI*00000000000" gerado pela biblioteca anterior (passlib 1.7.4).
# Garante que as senhas já gravadas no banco continuam válidas.
LEGACY_PASSLIB_HASH = "$2b$12$osDvzsx9kJq8tzKFrITq6eNsPs..W05p735EZ8KgwkShx60GGH9em"


def test_password_hashed_by_passlib_still_verifies() -> None:
    assert security.verify_password("FEPI*00000000000", LEGACY_PASSLIB_HASH)
    assert not security.verify_password("FEPI*00000000001", LEGACY_PASSLIB_HASH)


def test_hash_and_verify_round_trip() -> None:
    password_hash = security.hash_password("Senha com acentuação ção")

    assert password_hash.startswith("$2b$")
    assert security.verify_password("Senha com acentuação ção", password_hash)
    assert not security.verify_password("senha com acentuação ção", password_hash)


def test_password_longer_than_72_bytes_is_accepted() -> None:
    password_hash = security.hash_password("x" * 100)

    assert security.verify_password("x" * 100, password_hash)


def test_invalid_hash_in_database_does_not_raise() -> None:
    assert security.verify_password("qualquer", "hash-invalido") is False


def test_access_token_round_trip() -> None:
    token = security.create_access_token("user-id", "COORDINATOR")

    payload = security.decode_access_token(token)

    assert payload["sub"] == "user-id"
    assert payload["role"] == "COORDINATOR"


def test_tampered_or_expired_token_is_rejected() -> None:
    token = security.create_access_token("user-id", "STUDENT")
    expired = security.create_access_token("user-id", "STUDENT", expires_delta=timedelta(seconds=-1))

    with pytest.raises(ValueError):
        security.decode_access_token(token[:-4] + "AAAA")
    with pytest.raises(ValueError):
        security.decode_access_token(expired)
