"""add index on hospitals.ykiho (was missing, caused full table scans on ykiho lookups)

Revision ID: 9e1a4d7c3f2b
Revises: 7d2c8f4a1b6e
Create Date: 2026-07-15
"""
from alembic import op

revision = "9e1a4d7c3f2b"
down_revision = "7d2c8f4a1b6e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_hosp_ykiho", "hospitals", ["ykiho"])


def downgrade() -> None:
    op.drop_index("idx_hosp_ykiho", table_name="hospitals")
