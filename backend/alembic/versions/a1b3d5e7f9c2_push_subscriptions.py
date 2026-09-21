"""add push_subscriptions — PWA 웹 푸시 구독 저장

서버가 VAPID 키로 서명해 브라우저에 직접 푸시를 보내는 데 필요한 구독 정보(엔드포인트 +
p256dh/auth 키)를 저장한다. 발송은 app/push_notify.py, 구독 등록/해제는
app/routers/push.py.

Revision ID: a1b3d5e7f9c2
Revises: f9d3a7c2e5b1
Create Date: 2026-09-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b3d5e7f9c2'
down_revision: Union[str, Sequence[str], None] = 'f9d3a7c2e5b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('endpoint', sa.String(), nullable=False),
        sa.Column('p256dh', sa.String(), nullable=False),
        sa.Column('auth', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint', name='uq_push_subscription_endpoint'),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
