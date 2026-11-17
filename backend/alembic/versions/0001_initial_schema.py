"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-11-03 12:43:24.318618
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table('categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source_name', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=255), nullable=False),
    sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    sa.Column('is_visible', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('icon', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug'),
    sa.UniqueConstraint('source_name')
    )
    op.create_table('settings',
    sa.Column('key', sa.String(length=128), nullable=False),
    sa.Column('value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=64), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('username')
    )
    op.create_table('imports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('filename', sa.String(length=500), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('stats', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('refresh_tokens',
    sa.Column('jti', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('family', sa.UUID(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('jti')
    )
    op.create_index(op.f('ix_refresh_tokens_family'), 'refresh_tokens', ['family'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('products',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('model', sa.String(length=255), nullable=False),
    sa.Column('model_norm', sa.String(length=255), nullable=False),
    sa.Column('title', sa.Text(), server_default='', nullable=False),
    sa.Column('description', sa.Text(), server_default='', nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=True),
    sa.Column('group_name', sa.String(length=500), nullable=True),
    sa.Column('kind', sa.String(length=32), server_default='other', nullable=False),
    sa.Column('technology', sa.String(length=32), nullable=True),
    sa.Column('form_factor', sa.String(length=32), nullable=True),
    sa.Column('megapixels', sa.Float(), nullable=True),
    sa.Column('lens_min', sa.Float(), nullable=True),
    sa.Column('lens_max', sa.Float(), nullable=True),
    sa.Column('ir_range', sa.Integer(), nullable=True),
    sa.Column('channels', sa.Integer(), nullable=True),
    sa.Column('features', postgresql.ARRAY(sa.String(length=64)), server_default=sa.text("'{}'::varchar[]"), nullable=False),
    sa.Column('specs', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('price', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('price_raw', sa.String(length=64), nullable=True),
    sa.Column('prev_price', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('price_changed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('warranty_months', sa.Integer(), nullable=True),
    sa.Column('warranty_raw', sa.String(length=64), nullable=True),
    sa.Column('mpq', sa.Integer(), nullable=True),
    sa.Column('mpq_raw', sa.String(length=64), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('is_new', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('is_eol', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('replacement_model', sa.String(length=255), nullable=True),
    sa.Column('image_url', sa.Text(), nullable=True),
    sa.Column('images', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('is_hidden', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('sort_index', sa.Integer(), server_default='0', nullable=False),
    sa.Column('search_text', sa.Text(), server_default='', nullable=False),
    sa.Column('last_import_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['last_import_id'], ['imports.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('model')
    )
    op.create_index(op.f('ix_products_category_id'), 'products', ['category_id'], unique=False)
    op.create_index('ix_products_features', 'products', ['features'], unique=False, postgresql_using='gin')
    op.create_index(op.f('ix_products_form_factor'), 'products', ['form_factor'], unique=False)
    op.create_index(op.f('ix_products_is_active'), 'products', ['is_active'], unique=False)
    op.create_index(op.f('ix_products_kind'), 'products', ['kind'], unique=False)
    op.create_index(op.f('ix_products_megapixels'), 'products', ['megapixels'], unique=False)
    op.create_index(op.f('ix_products_model_norm'), 'products', ['model_norm'], unique=False)
    op.create_index('ix_products_model_trgm', 'products', ['model_norm'], unique=False, postgresql_using='gin', postgresql_ops={'model_norm': 'gin_trgm_ops'})
    op.create_index(op.f('ix_products_price'), 'products', ['price'], unique=False)
    op.create_index('ix_products_search_fts', 'products', [sa.literal_column("to_tsvector('russian', search_text)")], unique=False, postgresql_using='gin')
    op.create_index('ix_products_search_trgm', 'products', ['search_text'], unique=False, postgresql_using='gin', postgresql_ops={'search_text': 'gin_trgm_ops'})
    op.create_index(op.f('ix_products_technology'), 'products', ['technology'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_products_technology'), table_name='products')
    op.drop_index('ix_products_search_trgm', table_name='products', postgresql_using='gin', postgresql_ops={'search_text': 'gin_trgm_ops'})
    op.drop_index('ix_products_search_fts', table_name='products', postgresql_using='gin')
    op.drop_index(op.f('ix_products_price'), table_name='products')
    op.drop_index('ix_products_model_trgm', table_name='products', postgresql_using='gin', postgresql_ops={'model_norm': 'gin_trgm_ops'})
    op.drop_index(op.f('ix_products_model_norm'), table_name='products')
    op.drop_index(op.f('ix_products_megapixels'), table_name='products')
    op.drop_index(op.f('ix_products_kind'), table_name='products')
    op.drop_index(op.f('ix_products_is_active'), table_name='products')
    op.drop_index(op.f('ix_products_form_factor'), table_name='products')
    op.drop_index('ix_products_features', table_name='products', postgresql_using='gin')
    op.drop_index(op.f('ix_products_category_id'), table_name='products')
    op.drop_table('products')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_family'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_table('imports')
    op.drop_table('users')
    op.drop_table('settings')
    op.drop_table('categories')
