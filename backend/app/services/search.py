"""Catalog search: parsed query + explicit filters -> SQL, ranking, facets, fuzzy fallback."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import Integer, String, and_, case, cast, func, literal, not_, or_, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models import Category, Product
from app.services.query_parser import ParsedQuery, parse_query, parse_synonyms
from app.services.specs import (
    FEATURE_LABELS,
    FORM_LABELS,
    KIND_LABELS,
    SPEC_LABELS,
    SPEC_ORDER,
    TECH_LABELS,
)

TSV = func.to_tsvector("russian", Product.search_text)

SORTS = {"relevance", "price_asc", "price_desc", "mp_desc", "new", "model"}


@dataclass
class SearchParams:
    q: str = ""
    smart: bool = True
    category: list[str] = field(default_factory=list)
    kind: list[str] = field(default_factory=list)
    tech: list[str] = field(default_factory=list)
    form: list[str] = field(default_factory=list)
    mp: list[float] = field(default_factory=list)
    features: list[str] = field(default_factory=list)
    price_min: float | None = None
    price_max: float | None = None
    lens: float | None = None
    ir_min: int | None = None
    channels: int | None = None
    is_new: bool = False
    eol: str = "default"  # default | include | hide | only
    sort: str = "relevance"
    page: int = 1
    page_size: int = 30
    include_inactive: bool = False  # admin


# ----------------------------------------------------------------- pricing


def price_factor(settings: dict[str, Any]) -> float:
    return 1 + float(settings.get("price_adjust_percent") or 0) / 100


def display_price(value: Decimal | float | None, settings: dict[str, Any]) -> float | None:
    if value is None:
        return None
    factor = price_factor(settings)
    v = float(value) * factor
    step = float(settings.get("price_round") or 0)
    if factor != 1 and step > 0:
        v = round(v / step) * step
    return round(v, 2)


# ----------------------------------------------------------------- serialization


def key_specs(p: Product) -> list[str]:
    s = p.specs or {}
    out: list[str] = []
    if p.megapixels:
        out.append(f"{p.megapixels:g} Мп")
    if s.get("lens"):
        out.append(str(s["lens"]))
    if s.get("zoom"):
        out.append(f"зум {s['zoom']}")
    if s.get("ir_range"):
        out.append(f"ИК {s['ir_range']} м")
    if s.get("led_range"):
        out.append(f"LED {s['led_range']} м")
    if s.get("channels"):
        out.append(f"{s['channels']} кан.")
    if s.get("ports"):
        out.append(f"{s['ports']} портов")
    if s.get("max_resolution"):
        out.append(str(s["max_resolution"]))
    for f in ("poe", "ai", "full_color", "wifi", "lte", "mic", "active_deterrence"):
        if f in (p.features or []):
            out.append(FEATURE_LABELS[f].split(" /")[0])
    return out[:8]


def product_brief(p: Product, settings: dict[str, Any]) -> dict[str, Any]:
    show_prices = settings.get("show_prices", True)
    price = display_price(p.price, settings) if show_prices else None
    prev = display_price(p.prev_price, settings) if show_prices and settings.get("show_price_changes") else None
    trend = None
    if price is not None and prev is not None and prev != price:
        trend = "up" if price > prev else "down"
    return {
        "id": p.id,
        "model": p.model,
        "title": p.title,
        "category": {"slug": p.category.slug, "name": p.category.name} if p.category else None,
        "group": p.group_name,
        "kind": p.kind,
        "technology": p.technology,
        "form_factor": p.form_factor,
        "megapixels": p.megapixels,
        "features": p.features or [],
        "key_specs": key_specs(p),
        "price": price,
        "price_on_request": show_prices and p.price is None,
        "prev_price": prev if trend else None,
        "price_trend": trend,
        "warranty_months": p.warranty_months,
        "mpq": p.mpq,
        "mpq_raw": p.mpq_raw,
        "is_new": p.is_new,
        "is_eol": p.is_eol,
        "replacement_model": p.replacement_model,
        "note": p.note,
        "image_url": p.image_url,
        "images": p.images or [],
    }


def spec_rows(p: Product) -> list[dict[str, Any]]:
    s = p.specs or {}
    return [{"key": k, "label": SPEC_LABELS[k], "value": s[k]} for k in SPEC_ORDER if k in s]


def product_full(p: Product, settings: dict[str, Any]) -> dict[str, Any]:
    d = product_brief(p, settings)
    d.update(
        {
            "description": p.description,
            "specs": spec_rows(p),
            "feature_labels": [
                {"key": f, "label": FEATURE_LABELS.get(f, f)} for f in (p.features or [])
            ],
            "warranty_raw": p.warranty_raw,
            "price_changed_at": p.price_changed_at.isoformat() if p.price_changed_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
    )
    return d


# ----------------------------------------------------------------- conditions


def _ts_prefix(word: str) -> str | None:
    w = re.sub(r"[^\w]", "", word, flags=re.U)
    return f"{w}:*" if w else None


def _text_condition(pq: ParsedQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = []
    for t in pq.model_tokens:
        conds.append(
            or_(Product.model_norm.contains(t), Product.search_text.ilike(f"%{t}%"))
        )
    for w in pq.text_tokens:
        tsq = _ts_prefix(w)
        c = Product.search_text.ilike(f"%{w}%")
        if tsq:
            c = or_(TSV.op("@@")(func.to_tsquery("russian", tsq)), c)
        conds.append(c)
    return conds


def _fuzzy_condition(pq: ParsedQuery, threshold: float) -> tuple[ColumnElement[bool], Any]:
    parts: list[ColumnElement[bool]] = []
    scores: list[Any] = []
    for t in pq.model_tokens:
        sim = func.similarity(Product.model_norm, t)
        wsim = func.word_similarity(t, Product.model_norm)
        parts.append(or_(sim > threshold, wsim > max(threshold, 0.5)))
        scores += [sim, wsim]
    if pq.text_tokens:
        phrase = " ".join(pq.text_tokens)
        wsim = func.word_similarity(phrase, Product.search_text)
        parts.append(wsim > max(threshold, 0.35))
        scores.append(wsim)
    cond = or_(*parts) if parts else literal(False)
    score = func.greatest(*scores) if len(scores) > 1 else (scores[0] if scores else literal(0))
    return cond, score


def merge_filters(params: SearchParams, pq: ParsedQuery | None) -> dict[str, Any]:
    f: dict[str, Any] = {
        "category": list(params.category),
        "kind": list(params.kind),
        "tech": list(params.tech),
        "form": list(params.form),
        "mp": list(params.mp),
        "features": list(params.features),
        "price_min": params.price_min,
        "price_max": params.price_max,
        "lens": params.lens,
        "ir_min": params.ir_min,
        "channels": params.channels,
        "is_new": params.is_new,
        "eol": params.eol,
    }
    if pq is None:
        return f
    pf = pq.filters
    for key in ("form", "mp", "features"):
        for v in pf.get(key, []):
            if v not in f[key]:
                f[key].append(v)
    if "dome" in pf.get("form", []) and "minidome" not in f["form"]:
        f["form"].append("minidome")
    if pf.get("kind") and not f["kind"]:
        f["kind"] = [pf["kind"]]
    if pf.get("tech") and not f["tech"]:
        f["tech"] = [pf["tech"]]
    for key in ("price_min", "price_max", "lens", "ir_min", "channels"):
        if f[key] is None and pf.get(key) is not None:
            f[key] = pf[key]
    for key in ("mp_min", "zoom_min", "ports", "indoor"):
        if key in pf:
            f[key] = pf[key]
    return f


def build_conditions(
    f: dict[str, Any], settings: dict[str, Any], *, include_inactive: bool = False
) -> dict[str, list[ColumnElement[bool]]]:
    c: dict[str, list[ColumnElement[bool]]] = {k: [] for k in (
        "base", "category", "kind", "tech", "form", "mp", "features", "price", "misc", "eol"
    )}
    if not include_inactive:
        c["base"] += [
            Product.is_active.is_(True),
            Product.is_hidden.is_(False),
            or_(Product.category_id.is_(None), Category.is_visible.is_(True)),
        ]
    if f["category"]:
        c["category"].append(Category.slug.in_(f["category"]))
    if f["kind"]:
        c["kind"].append(Product.kind.in_(f["kind"]))
    if f["tech"]:
        c["tech"].append(Product.technology.in_(f["tech"]))
    if f["form"]:
        c["form"].append(Product.form_factor.in_(f["form"]))
    if f["mp"]:
        c["mp"].append(Product.megapixels.in_([float(x) for x in f["mp"]]))
    if f.get("mp_min") is not None:
        c["mp"].append(Product.megapixels >= float(f["mp_min"]))
    if f["features"]:
        c["features"].append(Product.features.contains(cast(f["features"], ARRAY(String(64)))))
    if f.get("indoor"):
        c["features"].append(not_(Product.features.contains(cast(["outdoor"], ARRAY(String(64))))))
    factor = price_factor(settings)
    if f["price_min"] is not None:
        c["price"].append(Product.price >= float(f["price_min"]) / factor)
    if f["price_max"] is not None:
        c["price"].append(Product.price <= float(f["price_max"]) / factor)
    if f["lens"] is not None:
        v = float(f["lens"])
        c["misc"].append(and_(Product.lens_min <= v + 0.05, Product.lens_max >= v - 0.05))
    if f["ir_min"] is not None:
        c["misc"].append(Product.ir_range >= int(f["ir_min"]))
    if f["channels"] is not None:
        c["misc"].append(Product.channels == int(f["channels"]))
    if f.get("ports") is not None:
        c["misc"].append(Product.specs["ports"].astext == str(int(f["ports"])))
    if f.get("zoom_min") is not None:
        zoom = cast(
            func.nullif(func.regexp_replace(Product.specs["zoom"].astext, "[^0-9]", "", "g"), ""),
            Integer,
        )
        c["misc"].append(zoom >= int(f["zoom_min"]))
    if f["is_new"]:
        c["misc"].append(Product.is_new.is_(True))
    eol = f.get("eol") or "default"
    if eol == "default":
        eol = "hide" if settings.get("hide_eol") else "include"
    if eol == "hide":
        c["eol"].append(Product.is_eol.is_(False))
    elif eol == "only":
        c["eol"].append(Product.is_eol.is_(True))
    return c


def _flatten(c: dict[str, list[ColumnElement[bool]]], exclude: str | None = None) -> list[Any]:
    return [x for k, v in c.items() if k != exclude for x in v]


def _base_select(*cols: Any):  # noqa: ANN202
    return select(*cols).select_from(Product).outerjoin(Category, Product.category_id == Category.id)


# ----------------------------------------------------------------- facets


async def compute_facets(
    session: AsyncSession, c: dict[str, list[ColumnElement[bool]]], settings: dict[str, Any]
) -> dict[str, Any]:
    async def group(col: Any, exclude: str) -> list[tuple[Any, int]]:
        stmt = (
            _base_select(col, func.count())
            .where(*_flatten(c, exclude))
            .where(col.is_not(None))
            .group_by(col)
        )
        return [(r[0], r[1]) for r in (await session.execute(stmt)).all()]

    cats_stmt = (
        _base_select(Category.slug, Category.name, Category.sort_order, func.count())
        .where(*_flatten(c, "category"))
        .where(Product.category_id.is_not(None))
        .group_by(Category.slug, Category.name, Category.sort_order)
        .order_by(Category.sort_order)
    )
    cats = [
        {"value": r[0], "label": r[1], "count": r[3]} for r in (await session.execute(cats_stmt)).all()
    ]
    kinds = await group(Product.kind, "kind")
    techs = await group(Product.technology, "tech")
    forms = await group(Product.form_factor, "form")
    mps = await group(Product.megapixels, "mp")

    feat = func.unnest(Product.features).label("f")
    feat_stmt = _base_select(feat).where(*_flatten(c)).subquery()
    feats = (
        await session.execute(
            select(feat_stmt.c.f, func.count()).group_by(feat_stmt.c.f).order_by(func.count().desc())
        )
    ).all()

    pr = (
        await session.execute(
            _base_select(func.min(Product.price), func.max(Product.price)).where(*_flatten(c, "price"))
        )
    ).one()

    def fmt(items: list[tuple[Any, int]], labels: dict[str, str]) -> list[dict[str, Any]]:
        order = list(labels)
        items = sorted(items, key=lambda x: order.index(x[0]) if x[0] in order else 99)
        return [{"value": v, "label": labels.get(v, v), "count": n} for v, n in items]

    return {
        "category": cats,
        "kind": fmt(kinds, KIND_LABELS),
        "tech": fmt(techs, TECH_LABELS),
        "form": fmt(forms, FORM_LABELS),
        "mp": [{"value": v, "label": f"{v:g} Мп", "count": n} for v, n in sorted(mps)],
        "features": [
            {"value": v, "label": FEATURE_LABELS.get(v, v), "count": n} for v, n in feats if v in FEATURE_LABELS
        ],
        "price": {
            "min": display_price(pr[0], settings) if pr[0] is not None else None,
            "max": display_price(pr[1], settings) if pr[1] is not None else None,
        },
    }


# ----------------------------------------------------------------- main entry


def _order_by(sort: str, score: Any | None) -> list[Any]:
    tail = [Category.sort_order.asc().nulls_last(), Product.sort_index.asc()]
    if sort == "price_asc":
        return [Product.price.asc().nulls_last(), *tail]
    if sort == "price_desc":
        return [Product.price.desc().nulls_last(), *tail]
    if sort == "mp_desc":
        return [Product.megapixels.desc().nulls_last(), Product.price.asc().nulls_last()]
    if sort == "new":
        return [Product.is_new.desc(), *tail]
    if sort == "model":
        return [Product.model.asc()]
    if score is not None:
        return [score.desc(), Product.is_eol.asc(), func.length(Product.model).asc(), *tail]
    return tail


def _relevance(pq: ParsedQuery) -> Any | None:
    if not pq.has_text:
        return None
    parts: list[Any] = []
    for t in pq.model_tokens:
        parts += [
            case((Product.model_norm == t, 1000), else_=0),
            case((Product.model_norm.startswith(t), 300), else_=0),
            case((func.regexp_replace(Product.model_norm, "^DHI?", "").startswith(t), 300), else_=0),
            case((Product.model_norm.contains(t), 100), else_=0),
            func.similarity(Product.model_norm, t) * 50,
        ]
    for w in pq.text_tokens:
        if tsq := _ts_prefix(w):
            parts.append(func.ts_rank(TSV, func.to_tsquery("russian", tsq)) * 40)
        parts.append(case((Product.title.ilike(f"%{w}%"), 20), else_=0))
    expr = parts[0]
    for p in parts[1:]:
        expr = expr + p
    return expr


async def search_products(
    session: AsyncSession,
    params: SearchParams,
    settings: dict[str, Any],
    *,
    with_facets: bool = True,
) -> dict[str, Any]:
    pq = None
    if params.q.strip():
        if params.smart:
            pq = parse_query(
                params.q,
                parse_synonyms(settings.get("search_synonyms", "")),
                layout_fix=bool(settings.get("search_layout_fix", True)),
            )
        else:
            pq = ParsedQuery(raw=params.q, normalized=params.q)
            for tok in params.q.split():
                if re.search(r"\d", tok) and re.search(r"[a-z]", tok, re.I):
                    pq.model_tokens.append(re.sub(r"[^A-Z0-9]", "", tok.upper()))
                else:
                    pq.text_tokens.append(tok.lower())

    f = merge_filters(params, pq)
    c = build_conditions(f, settings, include_inactive=params.include_inactive)
    text_conds = _text_condition(pq) if pq else []
    score = _relevance(pq) if pq else None
    fuzzy = False

    async def run(conds: list[Any], order: list[Any]) -> tuple[int, list[Product]]:
        total = (
            await session.execute(_base_select(func.count()).where(*conds))
        ).scalar_one()
        page_size = max(1, min(params.page_size, 200))
        offset = (max(params.page, 1) - 1) * page_size
        rows = (
            await session.execute(
                select(Product)
                .outerjoin(Category, Product.category_id == Category.id)
                .where(*conds)
                .order_by(*order)
                .offset(offset)
                .limit(page_size)
            )
        ).scalars().unique().all()
        return total, list(rows)

    sort = params.sort if params.sort in SORTS else "relevance"
    total, items = await run(_flatten(c) + text_conds, _order_by(sort, score))

    if total == 0 and pq is not None and pq.has_text:
        threshold = float(settings.get("search_fuzzy_threshold") or 0.3)
        fz_cond, fz_score = _fuzzy_condition(pq, threshold)
        total, items = await run(
            _flatten(c) + [fz_cond],
            [fz_score.desc(), *_order_by(sort if sort != "relevance" else "model", None)],
        )
        fuzzy = total > 0
        if fuzzy:
            text_conds = [fz_cond]

    if with_facets:
        facets = await compute_facets(session, {**c, "text": text_conds}, settings)
    else:
        facets = None

    page_size = max(1, min(params.page_size, 200))
    return {
        "items": [product_brief(p, settings) for p in items],
        "total": total,
        "page": params.page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)),
        "facets": facets,
        "query": {
            "raw": params.q,
            "layout_fixed": pq.layout_fixed if pq else None,
            "chips": pq.chips if pq else [],
            "model_tokens": pq.model_tokens if pq else [],
            "text_tokens": pq.text_tokens if pq else [],
            "fuzzy": fuzzy,
            "suggestion": items[0].model if fuzzy and items else None,
        },
    }
