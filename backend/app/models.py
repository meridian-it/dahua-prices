from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    jti: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_agent: Mapped[str | None] = mapped_column(String(255))


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    icon: Mapped[str | None] = mapped_column(String(64))

    products: Mapped[list[Product]] = relationship(back_populates="category")


class Product(TimestampMixin, Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    model_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, default="", server_default="")
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    group_name: Mapped[str | None] = mapped_column(String(500))

    kind: Mapped[str] = mapped_column(String(32), default="other", server_default="other", index=True)
    technology: Mapped[str | None] = mapped_column(String(32), index=True)
    form_factor: Mapped[str | None] = mapped_column(String(32), index=True)
    megapixels: Mapped[float | None] = mapped_column(Float, index=True)
    lens_min: Mapped[float | None] = mapped_column(Float)
    lens_max: Mapped[float | None] = mapped_column(Float)
    ir_range: Mapped[int | None] = mapped_column(Integer)
    channels: Mapped[int | None] = mapped_column(Integer)
    features: Mapped[list[str]] = mapped_column(
        ARRAY(String(64)), default=list, server_default=text("'{}'::varchar[]")
    )
    specs: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))

    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), index=True)
    price_raw: Mapped[str | None] = mapped_column(String(64))
    prev_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    price_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    warranty_months: Mapped[int | None] = mapped_column(Integer)
    warranty_raw: Mapped[str | None] = mapped_column(String(64))
    mpq: Mapped[int | None] = mapped_column(Integer)
    mpq_raw: Mapped[str | None] = mapped_column(String(64))

    note: Mapped[str | None] = mapped_column(Text)
    is_new: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    is_eol: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    replacement_model: Mapped[str | None] = mapped_column(String(255))

    # Photos: fetched from the vendor site (app/services/photos.py) or set by an admin.
    image_url: Mapped[str | None] = mapped_column(Text)
    images: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    # {"status": found|close|not_found|error|manual, "source", "matched", "page_url", "checked_at"}
    photo_meta: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    sort_index: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    search_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    last_import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id", ondelete="SET NULL"))

    category: Mapped[Category | None] = relationship(back_populates="products", lazy="joined")

    __table_args__ = (
        Index(
            "ix_products_search_fts",
            text("to_tsvector('russian', search_text)"),
            postgresql_using="gin",
        ),
        Index(
            "ix_products_model_trgm",
            "model_norm",
            postgresql_using="gin",
            postgresql_ops={"model_norm": "gin_trgm_ops"},
        ),
        Index(
            "ix_products_search_trgm",
            "search_text",
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"},
        ),
        Index("ix_products_features", "features", postgresql_using="gin"),
    )


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(32), default="done")
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Job(Base):
    """Long-running background task (photo fetching). Progress lives in the DB so any API worker
    can report it; `heartbeat_at` lets a restarted server detect jobs that died with a worker."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    total: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    processed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    error: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
