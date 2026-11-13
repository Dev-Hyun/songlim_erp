"""제안서 PACS 3종(ViewRex3 · GEMPACS · UBPACS-Z) — 마지막 금액 키 'pacs' → 'pacs:VIEWREX 3'

저장된 제안서의 items.pacs 는 {price}만 있어도 스키마가 model 기본값(VIEWREX 3)으로 읽으므로 고치지 않는다.

Revision ID: b5d1e7a3c9f2
Revises: a3f9c6e2d8b1
"""
import sqlalchemy as sa
from alembic import op

revision = "b5d1e7a3c9f2"
down_revision = "a3f9c6e2d8b1"
branch_labels = None
depends_on = None

OLD, NEW = "pacs", "pacs:VIEWREX 3"


def _move(src: str, dst: str):
    conn = op.get_bind()
    if conn.execute(sa.text("SELECT 1 FROM proposal_last_prices WHERE key = :k"), {"k": dst}).first():
        conn.execute(sa.text("DELETE FROM proposal_last_prices WHERE key = :k"), {"k": src})
    else:
        conn.execute(sa.text("UPDATE proposal_last_prices SET key = :d WHERE key = :s"), {"d": dst, "s": src})


def upgrade():
    _move(OLD, NEW)


def downgrade():
    _move(NEW, OLD)
