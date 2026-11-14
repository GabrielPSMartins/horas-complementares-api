"""
Autenticação de ponta a ponta: login, token JWT, get_current_user e require_roles.
Aqui o usuário logado NÃO é substituído: cada requisição envia o token real.
"""
from datetime import timedelta

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_roles
from app.core.security import create_access_token, hash_password
from app.db.dependencies import get_db
from app.main import app
from app.models.user import User, UserRole

PASSWORD = "FEPI*52998224725"


@pytest.fixture
def client(db: Session) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def create_user(db: Session, username: str, role: UserRole = UserRole.STUDENT, *, active: bool = True, must_change: bool = True) -> User:
    user = User(
        email=f"{username}@fepi.edu.br",
        username=username,
        password_hash=hash_password(PASSWORD),
        role=role,
        is_active=active,
        must_change_password=must_change,
    )
    db.add(user)
    db.commit()
    return user


def login(client: TestClient, username: str, password: str = PASSWORD):
    return client.post("/auth/login", data={"username": username, "password": password})


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------- /auth/login ----------

def test_login_returns_token_role_and_password_flag(db: Session, client: TestClient) -> None:
    create_user(db, "00023520")

    response = login(client, "00023520")

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["role"] == "STUDENT"
    assert body["must_change_password"] is True
    assert client.get("/auth/me", headers=auth_header(body["access_token"])).json()["username"] == "00023520"


@pytest.mark.parametrize("username,password", [("00023520", "senha-errada"), ("nao-existe", PASSWORD)])
def test_login_with_wrong_credentials_returns_401(db: Session, client: TestClient, username: str, password: str) -> None:
    create_user(db, "00023520")

    response = login(client, username, password)

    assert response.status_code == 401
    assert response.json() == {"detail": "Usuário ou senha inválidos."}


def test_login_of_inactive_user_returns_403(db: Session, client: TestClient) -> None:
    create_user(db, "inativo", active=False)

    assert login(client, "inativo").status_code == 403


# ---------- get_current_user ----------

def test_request_without_token_returns_401(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401


@pytest.mark.parametrize("token", ["nao-e-um-jwt", "a.b.c"])
def test_malformed_token_returns_401(client: TestClient, token: str) -> None:
    response = client.get("/auth/me", headers=auth_header(token))

    assert response.status_code == 401
    assert response.json() == {"detail": "Token inválido ou expirado."}


def test_expired_token_returns_401(db: Session, client: TestClient) -> None:
    user = create_user(db, "expirado")
    token = create_access_token(str(user.id), user.role.value, expires_delta=timedelta(seconds=-1))

    assert client.get("/auth/me", headers=auth_header(token)).status_code == 401


def test_token_of_deleted_user_returns_401(db: Session, client: TestClient) -> None:
    user = create_user(db, "removido")
    token = login(client, "removido").json()["access_token"]
    db.delete(user)
    db.commit()

    response = client.get("/auth/me", headers=auth_header(token))

    assert response.status_code == 401
    assert response.json() == {"detail": "Usuário não encontrado."}


def test_token_of_user_deactivated_after_login_returns_403(db: Session, client: TestClient) -> None:
    user = create_user(db, "desativado")
    token = login(client, "desativado").json()["access_token"]
    user.is_active = False
    db.commit()

    assert client.get("/auth/me", headers=auth_header(token)).status_code == 403


# ---------- require_roles ----------

def test_require_roles_allows_only_listed_roles(db: Session) -> None:
    probe = FastAPI()

    @probe.get("/coordenador")
    def only_coordinator(user: User = Depends(require_roles(UserRole.COORDINATOR, UserRole.ROOT))):
        return {"role": user.role.value}

    probe.dependency_overrides[get_db] = lambda: db
    client = TestClient(probe)

    for role, expected in [(UserRole.COORDINATOR, 200), (UserRole.ROOT, 200), (UserRole.STUDENT, 403)]:
        user = create_user(db, f"user-{role.value}", role)
        token = create_access_token(str(user.id), role.value)
        assert client.get("/coordenador", headers=auth_header(token)).status_code == expected, role


# ---------- /auth/change-password ----------

def test_change_password_with_wrong_current_password_returns_400(db: Session, client: TestClient) -> None:
    create_user(db, "troca")
    token = login(client, "troca").json()["access_token"]

    response = client.post("/auth/change-password", headers=auth_header(token), json={"current_password": "errada", "new_password": "NovaSenha@2026"})

    assert response.status_code == 400
    assert response.json() == {"detail": "Senha atual inválida."}


def test_change_password_replaces_password_and_clears_flag(db: Session, client: TestClient) -> None:
    create_user(db, "troca")
    token = login(client, "troca").json()["access_token"]

    response = client.post("/auth/change-password", headers=auth_header(token), json={"current_password": PASSWORD, "new_password": "NovaSenha@2026"})

    assert response.status_code == 200
    assert login(client, "troca").status_code == 401
    new_login = login(client, "troca", "NovaSenha@2026")
    assert new_login.status_code == 200
    assert new_login.json()["must_change_password"] is False


def test_token_with_non_uuid_subject_returns_401(client: TestClient) -> None:
    token = create_access_token("nao-e-uuid", "STUDENT")

    response = client.get("/auth/me", headers=auth_header(token))

    assert response.status_code == 401
    assert response.json() == {"detail": "Token inválido ou expirado."}
