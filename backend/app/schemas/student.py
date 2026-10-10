import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class StudentCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    cpf: str
    registration_number: str
    current_semester: int = Field(ge=1, le=8)
    enrollment_date: date
    expected_graduation_date: date | None = None
    course_id: uuid.UUID | None = None


class StudentCreateResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    last_name: str
    full_name: str
    email: str
    cpf: str
    registration_number: str
    current_semester: int
    username: str
    course_id: uuid.UUID
    enrollment_date: date
    created_at: datetime

    class Config:
        from_attributes = True