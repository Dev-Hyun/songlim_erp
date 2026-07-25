"""add equipment.model_series + backfill X-ray series from legacy manufacturer_map rules

Revision ID: d5e9b1c3a7f4
Revises: c7d1f4a9e3b8
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e9b1c3a7f4'
down_revision: Union[str, Sequence[str], None] = 'c7d1f4a9e3b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('equipment', sa.Column('model_series', sa.String(), nullable=True))
    op.create_index('idx_eq_series', 'equipment', ['model_series'])

    # X-ray 장비만 시리즈 백필 (초음파/CT/MRI/BMD/C-Arm은 model_series 없이 NULL 유지 — 모델명
    # 원본 그대로 쓰는 게 legacy 시스템의 원래 규칙이었음). distinct model 값 기준으로 한 번씩만
    # 계산해서 일괄 UPDATE — xray 148,506행이지만 distinct model은 1,181개뿐이라 빠르게 끝난다.
    from app.manufacturer_map import model_series as compute_series

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT DISTINCT model FROM equipment WHERE category = 'xray' AND model IS NOT NULL")).fetchall()
    for (model,) in rows:
        series = compute_series(model, 'xr')
        if series:
            conn.execute(
                sa.text("UPDATE equipment SET model_series = :series WHERE category = 'xray' AND model = :model"),
                {"series": series, "model": model},
            )


def downgrade() -> None:
    op.drop_index('idx_eq_series', table_name='equipment')
    op.drop_column('equipment', 'model_series')
