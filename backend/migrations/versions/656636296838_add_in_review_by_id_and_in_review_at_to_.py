"""add in_review_by_id and in_review_at to activity_requests

Revision ID: 656636296838
Revises: 337578aeeacb
Create Date: 2026-07-24 08:11:58.986891

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '656636296838'
down_revision: Union[str, Sequence[str], None] = '337578aeeacb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('activity_requests', sa.Column('in_review_by_id', sa.UUID(), nullable=True))
    op.add_column('activity_requests', sa.Column('in_review_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_activity_requests_in_review_by_id_users',
        'activity_requests',
        'users',
        ['in_review_by_id'],
        ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'fk_activity_requests_in_review_by_id_users',
        'activity_requests',
        type_='foreignkey',
    )
    op.drop_column('activity_requests', 'in_review_at')
    op.drop_column('activity_requests', 'in_review_by_id')