import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.validators import Cpf, PersonName, RegistrationNumber


class CoordinatorCreateRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    email: EmailStr
    cpf: Cpf
    registration_number: RegistrationNumber
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

    model_config = ConfigDict(from_attributes=True)


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
    course_total_semesters: int | None