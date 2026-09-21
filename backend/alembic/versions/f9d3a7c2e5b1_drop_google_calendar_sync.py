"""구글 캘린더 연동 제거 — google_calendar_links 테이블과 calendar_events.google_event_id 컬럼 삭제

Revision ID: f9d3a7c2e5b1
Revises: b7d2e9f4a1c8
Create Date: 2026-09-21
"""
from alembic import op

revision = "f9d3a7c2e5b1"
down_revision = "b7d2e9f4a1c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("google_calendar_links")
    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.drop_column("google_event_id")


def downgrade() -> None:
    import sqlalchemy as sa

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
