"""adiciona registration_number em coordinators

Revision ID: 254451cf71f7
Revises: f8034eb72d68
Create Date: 2026-09-26 18:31:23.386112

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '254451cf71f7'
down_revision: Union[str, Sequence[str], None] = 'f8034eb72d68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'coordinators',
        sa.Column('registration_number', sa.String(length=50), nullable=True),
    )
    # Backfill: coordenadores já existentes recebem uma matrícula
    # provisória baseada no id, apenas para satisfazer a constraint
    # NOT NULL/UNIQUE. Corrija manualmente depois se necessário.
    op.execute(
        "UPDATE coordinators SET registration_number = 'PROV-' || substr(id::text, 1, 8) "
        "WHERE registration_number IS NULL"
    )
    op.alter_column('coordinators', 'registration_number', nullable=False)
    op.create_unique_constraint(
        'uq_coordinators_registration_number',
        'coordinators',
        ['registration_number'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_coordinators_registration_number', 'coordinators', type_='unique')
    op.drop_column('coordinators', 'registration_number')