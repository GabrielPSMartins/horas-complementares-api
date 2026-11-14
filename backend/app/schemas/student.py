import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.validators import Cpf, PersonName, RegistrationNumber


class StudentCreateRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    email: EmailStr
    cpf: Cpf
    registration_number: RegistrationNumber
    current_semester: int = Field(ge=1, le=20)
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

    model_config = ConfigDict(from_attributes=True)


class StudentProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    first_name: str
    last_name: str
    email: str
    cpf: str
    registration_number: str
    current_semester: int
    enrollment_date: date
    expected_graduation_date: date | None
    course_id: uuid.UUID
    course_name: str


class StudentListItemResponse(BaseModel):
    id: uuid.UUID
    name: str
    first_name: str
    last_name: str
    email: str
    registration_number: str
    current_semester: int
    total_approved_hours: int
    total_required_hours: int
    hours_limit: int
    progress_percentage: float
    open_requests: int