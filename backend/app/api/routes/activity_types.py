import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user
from app.db.dependencies import get_db
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.activity_type import ActivityTypeResponse


router = APIRouter(prefix="/activity-types", tags=["activity-types"])


@router.get("", response_model=list[ActivityTypeResponse])
def list_activity_types(
    course_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityType]:
    query = select(ActivityType).where(ActivityType.is_active.is_(True))

    if current_user.role == UserRole.STUDENT:
        student = db.scalar(
            select(Student).where(Student.user_id == current_user.id)
        )

        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de aluno não encontrado.",
            )

        query = query.where(ActivityType.course_id == student.course_id)

    elif current_user.role == UserRole.COORDINATOR:
        coordinated_courses_query = select(Course.id).where(
            Course.coordinator_id == current_user.id,
            Course.is_active.is_(True),
        )

        coordinated_course_ids = db.scalars(coordinated_courses_query).all()

        if not coordinated_course_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nenhum curso vinculado ao coordenador encontrado.",
            )

        query = query.where(ActivityType.course_id.in_(coordinated_course_ids))

    elif current_user.role == UserRole.ROOT:
        if course_id:
            query = query.where(ActivityType.course_id == course_id)

    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não possui permissão para acessar este recurso.",
        )

    query = query.order_by(ActivityType.name.asc())

    return list(db.scalars(query).all())