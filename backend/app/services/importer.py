"""Excel -> DB import with upsert by model, price history and dry-run preview."""

from __future__ import annotations

import asyncio
import re
import time
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Import, Product
from app.services.excel import parse_note, parse_workbook
from app.services.query_parser import normalize_model
from app.services.specs import FEATURE_LABELS, FORM_LABELS, KIND_LABELS, TECH_LABELS, extract

TRANSLIT = dict(
    zip(
        "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        "a b v g d e e zh z i y k l m n o p r s t u f h ts ch sh sch _ y _ e yu ya".split(),
        strict=True,
    )
)


def slugify(text: str) -> str:
    out = "".join(TRANSLIT.get(ch, ch) for ch in text.lower()).replace("_", "")
    out = re.sub(r"[^a-z0-9]+", "-", out).strip("-")
    return out or "category"


def build_search_text(p: Product, category_name: str | None) -> str:
    model_spaced = re.sub(r"[-_/().]+", " ", p.model)
    parts = [
        p.model,
        model_spaced,
        p.model_norm,
        p.title,
        p.description,
        category_name or "",
        p.group_name or "",
        KIND_LABELS.get(p.kind, ""),
        FORM_LABELS.get(p.form_factor or "", ""),
        TECH_LABELS.get(p.technology or "", ""),
        " ".join(FEATURE_LABELS.get(f, "") for f in (p.features or [])),
        p.note or "",
    ]
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def apply_extracted(p: Product, category_name: str | None) -> None:
    ex = extract(p.description, p.model, category_name or "")
    p.title = ex.title or p.model
    p.kind = ex.kind
    p.technology = ex.technology
    p.form_factor = ex.form_factor
    p.megapixels = ex.megapixels
    p.lens_min = ex.lens_min
    p.lens_max = ex.lens_max
    p.ir_range = ex.ir_range
    p.channels = ex.channels
    p.features = ex.features
    p.specs = ex.specs
    p.search_text = build_search_text(p, category_name)


async def run_import(
    session: AsyncSession,
    data: bytes,
    filename: str,
    settings: dict[str, Any],
    *,
    user_id: int | None,
    dry_run: bool = False,
) -> dict[str, Any]:
    started = time.monotonic()
    parsed = await asyncio.to_thread(
        parse_workbook,
        data,
        skip_sheets=settings.get("import_skip_sheets") or [],
        header_aliases=settings.get("import_header_aliases") or None,
        header_scan_rows=int(settings.get("import_header_scan_rows") or 10),
    )
    if not parsed.rows:
        raise ValueError(
            "В файле не найдено ни одного товара. Проверьте формат или настройки импорта "
            "(названия колонок, пропускаемые листы)."
        )

    now = datetime.now(UTC)
    imp = Import(filename=filename, user_id=user_id, status="running")
    session.add(imp)
    await session.flush()

    # categories
    existing_cats = {c.source_name: c for c in (await session.execute(select(Category))).scalars()}
    used_slugs = {c.slug for c in existing_cats.values()}
    cats: dict[str, Category] = {}
    created_cats = 0
    next_order = max((c.sort_order for c in existing_cats.values()), default=-1) + 1
    for order, name in enumerate(parsed.categories):
        cat = existing_cats.get(name)
        if cat is None:
            slug = base = slugify(name)
            i = 2
            while slug in used_slugs:
                slug, i = f"{base}-{i}", i + 1
            used_slugs.add(slug)
            cat = Category(
                source_name=name,
                name=name,
                slug=slug,
                sort_order=next_order + order,
                is_visible=bool(settings.get("import_new_categories_visible", True)),
            )
            session.add(cat)
            created_cats += 1
        cats[name] = cat
    await session.flush()

    existing = {p.model.upper(): p for p in (await session.execute(select(Product))).scalars()}
    new_markers = settings.get("import_new_markers") or []
    eol_markers = settings.get("import_eol_markers") or []

    stats = {
        "rows": len(parsed.rows),
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "price_up": 0,
        "price_down": 0,
        "reactivated": 0,
        "deactivated": 0,
        "duplicates": parsed.duplicates,
        "categories": len(parsed.categories),
        "categories_created": created_cats,
        "skipped_sheets": parsed.skipped_sheets,
        "warnings": parsed.warnings[:50],
        "price_changes": [],
        "new_models": [],
    }
    seen: set[str] = set()

    for idx, row in enumerate(parsed.rows):
        key = row.model.upper()
        seen.add(key)
        cat = cats[row.category]
        note_info = parse_note(row.note, new_markers, eol_markers)
        price = Decimal(str(row.price)).quantize(Decimal("0.01")) if row.price is not None else None

        p = existing.get(key)
        is_new_product = p is None
        if p is None:
            p = Product(model=row.model, images=[], features=[], specs={})
            session.add(p)
            existing[key] = p
            stats["created"] += 1
            if len(stats["new_models"]) < 200:
                stats["new_models"].append(row.model)
        else:
            if not p.is_active:
                stats["reactivated"] += 1

        old_price = p.price
        changed = is_new_product or any(
            (
                p.description != row.description,
                old_price != price,
                p.category_id != cat.id,
                p.group_name != row.group,
                p.note != row.note,
                p.warranty_raw != row.warranty_raw,
                p.mpq_raw != row.mpq_raw,
                not p.is_active,
            )
        )
        if not is_new_product and old_price != price:
            p.prev_price = old_price
            p.price_changed_at = now
            if old_price is not None and price is not None:
                if price > old_price:
                    stats["price_up"] += 1
                else:
                    stats["price_down"] += 1
                if len(stats["price_changes"]) < 300:
                    stats["price_changes"].append(
                        {"model": row.model, "old": float(old_price), "new": float(price)}
                    )

        p.model = row.model
        p.model_norm = normalize_model(row.model)
        p.description = row.description
        p.category_id = cat.id
        p.category = cat
        p.group_name = row.group
        p.price = price
        p.price_raw = row.price_raw
        p.warranty_months = row.warranty_months
        p.warranty_raw = row.warranty_raw
        p.mpq = row.mpq
        p.mpq_raw = row.mpq_raw
        p.note = row.note
        p.is_new = note_info["is_new"]
        p.is_eol = note_info["is_eol"]
        p.replacement_model = note_info["replacement"]
        p.is_active = True
        p.sort_index = idx
        p.last_import_id = imp.id
        apply_extracted(p, cat.name)

        if not is_new_product:
            stats["updated" if changed else "unchanged"] += 1

    if settings.get("import_deactivate_missing", True):
        for key, p in existing.items():
            if key not in seen and p.is_active:
                p.is_active = False
                stats["deactivated"] += 1

    stats["duration_sec"] = round(time.monotonic() - started, 2)
    imp.stats = stats
    imp.status = "dry_run" if dry_run else "done"

    if dry_run:
        await session.rollback()
    else:
        await session.commit()
        stats["import_id"] = imp.id
    return stats


async def reindex_all(session: AsyncSession) -> int:
    products = (await session.execute(select(Product))).scalars().all()
    for p in products:
        apply_extracted(p, p.category.name if p.category else None)
    await session.commit()
    return len(products)
