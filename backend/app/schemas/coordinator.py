import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class CoordinatorCreateRequest(BaseModel):
    name: str
    email: EmailStr
    cpf: str
    registration_number: str
    course_id: uuid.UUID


class CoordinatorCreateResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    email: str
    cpf: str
    registration_number: str
    username: str
    course_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True