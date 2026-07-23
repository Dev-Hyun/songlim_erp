"""cloud NAS rebuild — real folder hierarchy (storage_folders), file metadata, folder_id-based permissions

Revision ID: e8f2a5c1b7d3
Revises: d4a7c2e9f1b6
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8f2a5c1b7d3'
down_revision: Union[str, Sequence[str], None] = 'd4a7c2e9f1b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'storage_folders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('root', sa.String(), nullable=False),
        sa.Column('space', sa.String(), nullable=False, server_default='shared'),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('storage_folders.id'), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    )
    op.create_index('idx_storage_folder_parent', 'storage_folders', ['root', 'space', 'owner_id', 'parent_id'])

    # storage_files / storage_folder_permissions were shipped empty (no feature usage yet) — safe to rebuild clean
    op.drop_table('storage_files')
    op.create_table(
        'storage_files',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('root', sa.String(), nullable=False),
        sa.Column('space', sa.String(), nullable=False, server_default='shared'),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('folder_id', sa.Integer(), sa.ForeignKey('storage_folders.id'), nullable=True),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('file_key', sa.String(), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    )
    op.create_index('idx_storage_file_folder', 'storage_files', ['root', 'space', 'owner_id', 'folder_id'])

    op.drop_table('storage_folder_permissions')
    op.create_table(
        'storage_folder_permissions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('folder_id', sa.Integer(), sa.ForeignKey('storage_folders.id'), nullable=False),
        sa.Column('position', sa.String(), nullable=False),
        sa.Column('permission_level', sa.String(), nullable=False),
        sa.CheckConstraint("permission_level IN ('view','edit')", name='ck_storage_perm_level'),
    )


def downgrade() -> None:
    op.drop_table('storage_folder_permissions')
    op.create_table(
        'storage_folder_permissions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('folder_path', sa.String(), nullable=False),
        sa.Column('position', sa.String(), nullable=False),
        sa.Column('permission_level', sa.String(), nullable=False),
        sa.CheckConstraint("permission_level IN ('view','edit')", name='ck_storage_perm_level'),
    )

    op.drop_table('storage_files')
    op.create_table(
        'storage_files',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('folder_path', sa.String(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('file_key', sa.String(), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    )
    op.create_index('idx_storage_folder', 'storage_files', ['folder_path'])

    op.drop_table('storage_folders')
