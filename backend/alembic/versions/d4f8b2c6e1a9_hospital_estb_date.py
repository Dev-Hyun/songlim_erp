"""add hospitals.estb_date — 심평원 병원정보서비스의 개설일자(estbDd)

의료기관 개설 현황 화면이 연 단위 프록시(장비 신고 최초 등장 연도)로 동작하고 있었는데,
실제 개설일자를 받아오면 일/월 단위 집계가 가능해진다.

Revision ID: d4f8b2c6e1a9
Revises: c8e1a5f7d2b4
Create Date: 2026-09-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f8b2c6e1a9'
down_revision: Union[str, Sequence[str], None] = 'c8e1a5f7d2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('hospitals', sa.Column('estb_date', sa.String(), nullable=True))
    op.create_index('idx_hosp_estb_date', 'hospitals', ['estb_date'])


def downgrade() -> None:
    op.drop_index('idx_hosp_estb_date', table_name='hospitals')
    op.drop_column('hospitals', 'estb_date')
