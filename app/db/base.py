from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models import (  
    ActivityAttachment,
    ActivityRequest,
    ActivityRequestHistory,
    ActivityType,
    Course,
    Student,
    User,
)