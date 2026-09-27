"""cria tabela coordinators e adiciona current_semester em students

Revision ID: f8034eb72d68
Revises: 656636296838
Create Date: 2026-09-21 13:32:33.937577

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8034eb72d68'
down_revision: Union[str, Sequence[str], None] = '656636296838'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('coordinators',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('cpf', sa.String(length=14), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('cpf'),
    sa.UniqueConstraint('user_id')
    )

    op.add_column(
        'students',
        sa.Column('current_semester', sa.Integer(), nullable=False, server_default='1'),
    )
    op.create_check_constraint(
        'ck_students_current_semester_range',
        'students',
        'current_semester >= 1 AND current_semester <= 8',
    )
    op.alter_column('students', 'current_semester', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_students_current_semester_range', 'students', type_='check')
    op.drop_column('students', 'current_semester')
    op.drop_table('coordinators')