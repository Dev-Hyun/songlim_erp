"""storage: add updated_at, favorites and access-tracking tables

Revision ID: d7f2a9c4e1b8
Revises: c4d8f1a6e2b7
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd7f2a9c4e1b8'
down_revision: Union[str, Sequence[str], None] = 'c4d8f1a6e2b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('storage_folders', sa.Column('updated_at', sa.String(), nullable=True))
    op.add_column('storage_files', sa.Column('updated_at', sa.String(), nullable=True))

    op.create_table(
        'storage_favorites',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('folder_id', sa.Integer(), sa.ForeignKey('storage_folders.id', ondelete='CASCADE'), nullable=True),
        sa.Column('file_id', sa.Integer(), sa.ForeignKey('storage_files.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.UniqueConstraint('user_id', 'folder_id', 'file_id', name='uq_storage_favorite'),
    )
    op.create_index('idx_storage_favorite_user', 'storage_favorites', ['user_id'])

    op.create_table(
        'storage_access',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('file_id', sa.Integer(), sa.ForeignKey('storage_files.id', ondelete='CASCADE'), nullable=False),
        sa.Column('accessed_at', sa.String(), nullable=False),
        sa.UniqueConstraint('user_id', 'file_id', name='uq_storage_access'),
    )
    op.create_index('idx_storage_access_user', 'storage_access', ['user_id'])


def downgrade() -> None:
    op.drop_index('idx_storage_access_user', table_name='storage_access')
    op.drop_table('storage_access')
    op.drop_index('idx_storage_favorite_user', table_name='storage_favorites')
    op.drop_table('storage_favorites')
    op.drop_column('storage_files', 'updated_at')
    op.drop_column('storage_folders', 'updated_at')
