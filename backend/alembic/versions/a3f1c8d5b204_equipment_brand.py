"""add equipment.brand — 제조원과 시장 브랜드를 갈라 놓는다

식약처 허가가 주는 제조사는 **제조원**이라 시장 브랜드와 다르다(GM85 제조원 (주)디알텍 /
브랜드 삼성, Discovery Ci 제조원 Flextronics / 브랜드 Hologic). 영업에는 브랜드가 쓸모 있지만
manufacturer 를 덮어쓰면 근거(허가번호 → 제조원) 추적이 끊기고 되돌릴 수 없다. 그래서 컬럼을
하나 더 둔다.

NULL = "브랜드는 manufacturer 값 그대로". 값이 들어가는 건 app/brand_map.py 의 손수 관리 표가
다른 브랜드를 지목한 행뿐이다. 관리 범위는 레거시 6분류(us/xray/carm/mri/bmd/ct)로 한정한다.

백필은 여기서 하지 않는다 — 백업·되돌리기·dry-run 이 필요한 데이터 작업이라
backend/scripts/apply_brand.py 가 맡는다.

Revision ID: a3f1c8d5b204
Revises: f1a6c3d9e2b5
Create Date: 2026-09-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f1c8d5b204'
down_revision: Union[str, Sequence[str], None] = 'f1a6c3d9e2b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('equipment', sa.Column('brand', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('equipment', 'brand')
