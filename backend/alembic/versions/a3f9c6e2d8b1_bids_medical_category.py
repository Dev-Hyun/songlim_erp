"""입찰정보 의료장비 분류·상세 칼럼 — category, items, notice_date, budget_amount, notice_kind, detail_json

나라장터 물품 공고를 모두 받아 제목 + 구매대상물품(물품분류 42=의료장비)으로 의료장비를 가려 분류한다.
기존 행은 비워 둔다(다음 수집 때 다시 채워진다).

Revision ID: a3f9c6e2d8b1
Revises: c4e8a2f6b1d3
"""
import sqlalchemy as sa
from alembic import op

revision = "a3f9c6e2d8b1"
down_revision = "c4e8a2f6b1d3"
branch_labels = None
depends_on = None

COLS = [
    ("category", sa.String()),
    ("items", sa.String()),
    ("notice_date", sa.String()),
    ("budget_amount", sa.Integer()),
    ("notice_kind", sa.String()),
    ("detail_json", sa.String()),
]


def upgrade():
    with op.batch_alter_table("bids") as batch_op:
        for name, type_ in COLS:
            batch_op.add_column(sa.Column(name, type_, nullable=True))


def downgrade():
    with op.batch_alter_table("bids") as batch_op:
        for name, _ in reversed(COLS):
            batch_op.drop_column(name)
