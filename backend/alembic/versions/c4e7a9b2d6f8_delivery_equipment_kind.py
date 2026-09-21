"""deliveries.equipment_kind 추가 — DEMO 장비 종류(초음파/X-ray/기타)

DEMO 목록에서 병원명 앞에 장비 종류를 색으로 구분해 보여주기 위한 칸이다.
demo 전용 필드이고, 기존 행은 NULL(미지정)로 남는다 — 소급 입력은 사용자가 화면에서 한다.

Revision ID: c4e7a9b2d6f8
Revises: a1b3d5e7f9c2
"""
import sqlalchemy as sa
from alembic import op

revision = "c4e7a9b2d6f8"
down_revision = "a1b3d5e7f9c2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("deliveries", sa.Column("equipment_kind", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("deliveries") as batch:
        batch.drop_column("equipment_kind")
