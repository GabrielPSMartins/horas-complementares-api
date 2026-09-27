import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class StudentCreateRequest(BaseModel):
    name: str
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
    name: str
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