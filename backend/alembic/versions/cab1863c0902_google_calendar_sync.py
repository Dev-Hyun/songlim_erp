"""add google_event_id to calendar_events + google_calendar_links table

Revision ID: cab1863c0902
Revises: ec4a88ab789e
Create Date: 2026-07-20
"""
from alembic import op
import sqlalchemy as sa

revision = "cab1863c0902"
down_revision = "ec4a88ab789e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.add_column(sa.Column("google_event_id", sa.String(), nullable=True))

    op.create_table(
        "google_calendar_links",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("google_calendar_id", sa.String(), nullable=False),
        sa.Column("access_token", sa.String(), nullable=False),
        sa.Column("refresh_token", sa.String(), nullable=False),
        sa.Column("token_expiry", sa.String(), nullable=False),
        sa.Column("sync_token", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("google_calendar_links")
    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.drop_column("google_event_id")
