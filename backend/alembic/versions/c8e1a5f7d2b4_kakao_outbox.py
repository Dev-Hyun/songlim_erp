"""add kakao_outbox — 카카오톡 단톡방 알림 대기열

서버는 알림을 이 테이블에 쌓기만 하고, 실제 발송은 사내 PC에서 도는 브리지
(tools/kakao_bridge/bridge.py)가 폴링해 처리한다.

Revision ID: c8e1a5f7d2b4
Revises: b2d6f8a1c3e7
Create Date: 2026-09-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8e1a5f7d2b4'
down_revision: Union[str, Sequence[str], None] = 'b2d6f8a1c3e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'kakao_outbox',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('text', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_error', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('sent_at', sa.String(), nullable=True),
    )
    op.create_index('idx_kakao_outbox_status', 'kakao_outbox', ['status', 'id'])


def downgrade() -> None:
    op.drop_index('idx_kakao_outbox_status', table_name='kakao_outbox')
    op.drop_table('kakao_outbox')
