from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.student import Student
from app.models.user import User, UserRole


TEMP_PASSWORD_HASH = "temporary_hash_until_auth_is_implemented"


def get_or_create_user(
    db: Session,
    *,
    email: str,
    username: str,
    role: UserRole,
    must_change_password: bool = True,
) -> User:
    existing_user = db.scalar(
        select(User).where(User.username == username)
    )

    if existing_user:
        return existing_user

    user = User(
        email=email,
        username=username,
        password_hash=TEMP_PASSWORD_HASH,
        role=role,
        is_active=True,
        must_change_password=must_change_password,
    )

    db.add(user)
    db.flush()

    return user


def get_or_create_course(
    db: Session,
    *,
    name: str,
    code: str,
    coordinator_id,
) -> Course:
    existing_course = db.scalar(
        select(Course).where(Course.code == code)
    )

    if existing_course:
        return existing_course

    course = Course(
        name=name,
        code=code,
        total_required_hours=200,
        max_extra_hours=10,
        coordinator_id=coordinator_id,
        is_active=True,
    )

    db.add(course)
    db.flush()

    return course


def get_or_create_student(
    db: Session,
    *,
    user_id,
    course_id,
    name: str,
    cpf: str,
    registration_number: str,
) -> Student:
    existing_student = db.scalar(
        select(Student).where(Student.registration_number == registration_number)
    )

    if existing_student:
        return existing_student

    student = Student(
        user_id=user_id,
        course_id=course_id,
        name=name,
        cpf=cpf,
        registration_number=registration_number,
        enrollment_date=date(2023, 2, 1),
        expected_graduation_date=date(2026, 12, 31),
        is_active=True,
    )

    db.add(student)
    db.flush()

    return student


def get_or_create_activity_type(
    db: Session,
    *,
    course_id,
    name: str,
    description: str,
    max_hours_per_request: int = 50,
    max_hours_total: int | None = None,
) -> ActivityType:
    existing_activity_type = db.scalar(
        select(ActivityType).where(
            ActivityType.course_id == course_id,
            ActivityType.name == name,
        )
    )

    if existing_activity_type:
        return existing_activity_type

    activity_type = ActivityType(
        course_id=course_id,
        name=name,
        description=description,
        max_hours_per_request=max_hours_per_request,
        max_hours_total=max_hours_total,
        requires_attachment=True,
        is_active=True,
    )

    db.add(activity_type)
    db.flush()

    return activity_type


def seed_development_data() -> None:
    db = SessionLocal()

    try:
        root_user = get_or_create_user(
            db,
            email="root@fepi.edu.br",
            username="root",
            role=UserRole.ROOT,
            must_change_password=True,
        )

        coordinator_user = get_or_create_user(
            db,
            email="coordenador.si@fepi.edu.br",
            username="coordenador.si",
            role=UserRole.COORDINATOR,
            must_change_password=True,
        )

        course = get_or_create_course(
            db,
            name="Sistemas de Informação",
            code="SI",
            coordinator_id=coordinator_user.id,
        )

        student_user = get_or_create_user(
            db,
            email="aluno.teste@fepi.edu.br",
            username="20230001",
            role=UserRole.STUDENT,
            must_change_password=True,
        )

        get_or_create_student(
            db,
            user_id=student_user.id,
            course_id=course.id,
            name="Aluno Teste",
            cpf="000.000.000-00",
            registration_number="20230001",
        )

        activity_types = [
            {
                "name": "Curso",
                "description": "Cursos extracurriculares, livres ou de aperfeiçoamento relacionados à formação do aluno.",
            },
            {
                "name": "Palestra",
                "description": "Participação em palestras acadêmicas, técnicas ou profissionais.",
            },
            {
                "name": "Workshop",
                "description": "Participação em oficinas práticas, treinamentos rápidos ou workshops.",
            },
            {
                "name": "Congresso",
                "description": "Participação em congressos, simpósios, semanas acadêmicas ou eventos científicos.",
            },
            {
                "name": "Seminário",
                "description": "Participação em seminários, encontros acadêmicos ou apresentações técnicas.",
            },
            {
                "name": "Monitoria",
                "description": "Atividades de monitoria acadêmica reconhecidas pela instituição.",
            },
            {
                "name": "Iniciação Científica",
                "description": "Participação em projetos de iniciação científica, pesquisa ou produção acadêmica.",
            },
            {
                "name": "Projeto de Extensão",
                "description": "Participação em projetos de extensão, ações comunitárias ou atividades institucionais.",
            },
            {
                "name": "Publicação Acadêmica",
                "description": "Publicação de artigos, resumos, trabalhos acadêmicos ou materiais científicos.",
            },
            {
                "name": "Visita Técnica",
                "description": "Participação em visitas técnicas relacionadas ao curso.",
            },
            {
                "name": "Evento Acadêmico",
                "description": "Participação em eventos acadêmicos diversos relacionados à área de formação.",
            },
            {
                "name": "Estágio Não Obrigatório",
                "description": "Atividades de estágio não obrigatório aceitas como atividade complementar.",
            },
            {
                "name": "Outro",
                "description": "Atividade complementar não classificada nos tipos anteriores, sujeita à análise do coordenador.",
            },
        ]

        for activity_type in activity_types:
            get_or_create_activity_type(
                db,
                course_id=course.id,
                name=activity_type["name"],
                description=activity_type["description"],
                max_hours_per_request=50,
                max_hours_total=None,
            )

        db.commit()

        print("Seed de desenvolvimento executada com sucesso.")
        print(f"Root criado/validado: {root_user.username}")
        print(f"Coordenador criado/validado: {coordinator_user.username}")
        print(f"Curso criado/validado: {course.name}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_development_data()