import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user
from app.api.responses import error_responses
from app.core.security import create_access_token, hash_password, verify_password
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, MeResponse, MessageResponse, TokenResponse


router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Autentica pela matrícula e senha e devolve o token JWT",
    responses=error_responses(401, 403),
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = db.scalar(
        select(User).where(User.username == form_data.username)
    )

    if not user or not verify_password(form_data.password, user.password_hash):
        logger.warning("login_failed | username=%s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo.",
        )

    logger.info("login_succeeded | user_id=%s role=%s", user.id, user.role.value)

    access_token = create_access_token(
        subject=str(user.id),
        role=user.role.value,
    )

    return TokenResponse(
        access_token=access_token,
        must_change_password=user.must_change_password,
        role=user.role.value,
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Troca a senha do usuário logado",
    responses=error_responses(400, 401),
)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual inválida.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False

    db.add(current_user)
    db.commit()

    logger.info("password_changed | user_id=%s", current_user.id)

    return MessageResponse(message="Senha alterada com sucesso.")


@router.get(
    "/me",
    response_model=MeResponse,
    summary="Dados básicos do usuário logado",
    responses=error_responses(401),
)
def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role.value,
        must_change_password=current_user.must_change_password,
        is_active=current_user.is_active,
    )