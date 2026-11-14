"""adiciona total_semesters ao curso

Revision ID: a6f35ddfb18f
Revises: da96c7a256de
Create Date: 2026-11-01 18:43:48.879055

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6f35ddfb18f'
down_revision: Union[str, Sequence[str], None] = 'da96c7a256de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Cursos existentes ficam com 8 semestres (o valor que estava fixo).
    op.add_column('courses', sa.Column('total_semesters', sa.Integer(), server_default='8', nullable=False))
    op.create_check_constraint('ck_courses_total_semesters_positive', 'courses', 'total_semesters >= 1')

    # O teto do semestre do aluno passa a depender do curso e é validado no serviço.
    op.drop_constraint('ck_students_current_semester_range', 'students', type_='check')
    op.create_check_constraint('ck_students_current_semester_positive', 'students', 'current_semester >= 1')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_students_current_semester_positive', 'students', type_='check')
    op.create_check_constraint(
        'ck_students_current_semester_range', 'students', 'current_semester >= 1 AND current_semester <= 8'
    )

    op.drop_constraint('ck_courses_total_semesters_positive', 'courses', type_='check')
    op.drop_column('courses', 'total_semesters')
