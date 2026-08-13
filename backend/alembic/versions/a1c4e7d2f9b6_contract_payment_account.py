"""add contracts.payment_account / account_holder (계약서의 고객지불계좌·예금주)

Revision ID: a1c4e7d2f9b6
Revises: e3a7c1f5b9d2
Create Date: 2026-08-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c4e7d2f9b6'
down_revision: Union[str, Sequence[str], None] = 'e3a7c1f5b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contracts', sa.Column('payment_account', sa.String(), nullable=True))
    op.add_column('contracts', sa.Column('account_holder', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'account_holder')
    op.drop_column('contracts', 'payment_account')
