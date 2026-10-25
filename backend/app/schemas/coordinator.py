import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class CoordinatorCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    cpf: str
    registration_number: str
    course_id: uuid.UUID


class CoordinatorCreateResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    last_name: str
    full_name: str
    email: str
    cpf: str
    registration_number: str
    username: str
    course_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class CoordinatorMeResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    last_name: str
    full_name: str
    email: str
    cpf: str
    registration_number: str
    username: str
    must_change_password: bool
    course_id: uuid.UUID | None
    course_name: str | None