from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from config.settings import settings


# O bcrypt só considera os primeiros 72 bytes da senha. A biblioteca usada
# antes (passlib) truncava nesse limite; mantemos o mesmo comportamento para
# que as senhas já cadastradas continuem válidas.
BCRYPT_MAX_BYTES = 72


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain_password), password_hash.encode("utf-8"))
    except ValueError:
        # Hash em formato inválido no banco.
        return False


def create_access_token(
    subject: str,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.access_token_expire_minutes)
    )

    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
    except jwt.PyJWTError as exc:
        raise ValueError("Invalid token") from exc
