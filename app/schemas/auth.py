from pydantic import BaseModel


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
