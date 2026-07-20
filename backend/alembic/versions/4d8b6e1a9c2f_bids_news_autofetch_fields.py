"""add autofetch fields to bids/news_articles (G2B/D2B + RSS/scraping port)

Revision ID: 4d8b6e1a9c2f
Revises: 7c2e5f9a1d3b
Create Date: 2026-07-13 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d8b6e1a9c2f'
down_revision: Union[str, Sequence[str], None] = '7c2e5f9a1d3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTE: 컬럼 추가는 최초 실행 시도에서 이미 반영됨 (batch 단계 실패로 재실행됐던 이력) —
    # 유니크 제약만 별도 batch로 추가.
    with op.batch_alter_table('news_articles') as batch_op:
        batch_op.create_unique_constraint('uq_news_url_hash', ['url_hash'])


def downgrade() -> None:
    with op.batch_alter_table('news_articles') as batch_op:
        batch_op.drop_constraint('uq_news_url_hash', type_='unique')
        batch_op.drop_column('rank')
        batch_op.drop_column('thumbnail')
        batch_op.drop_column('url_hash')
    with op.batch_alter_table('bids') as batch_op:
        batch_op.drop_column('files_json')
        batch_op.drop_column('source')
