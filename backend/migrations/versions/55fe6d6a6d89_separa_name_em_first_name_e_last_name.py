"""separa name em first_name e last_name

Revision ID: 55fe6d6a6d89
Revises: 254451cf71f7
Create Date: 2026-10-04 20:24:35.790883

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55fe6d6a6d89'
down_revision: Union[str, Sequence[str], None] = '254451cf71f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ("students", "coordinators"):
        op.add_column(table, sa.Column("first_name", sa.String(length=120), nullable=True))
        op.add_column(table, sa.Column("last_name", sa.String(length=120), nullable=True))

        # Backfill: primeira palavra vira first_name, o restante vira last_name.
        op.execute(
            f"""
            UPDATE {table}
            SET first_name = split_part(trim(name), ' ', 1),
                last_name = COALESCE(
                    NULLIF(trim(substr(trim(name), length(split_part(trim(name), ' ', 1)) + 1)), ''),
                    ''
                )
            """
        )

        op.alter_column(table, "first_name", nullable=False)
        op.alter_column(table, "last_name", nullable=False)
        op.drop_column(table, "name")


def downgrade() -> None:
    """Downgrade schema."""
    for table in ("students", "coordinators"):
        op.add_column(table, sa.Column("name", sa.String(length=255), nullable=True))
        op.execute(f"UPDATE {table} SET name = trim(first_name || ' ' || last_name)")
        op.alter_column(table, "name", nullable=False)
        op.drop_column(table, "last_name")
        op.drop_column(table, "first_name")
