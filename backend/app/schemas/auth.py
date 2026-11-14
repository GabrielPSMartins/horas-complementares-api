import uuid

from pydantic import BaseModel


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class MeResponse(BaseModel):
    id: uuid.UUID
    username: str
    role: str
    must_change_password: bool
    is_active: bool


class MessageResponse(BaseModel):
    message: str
