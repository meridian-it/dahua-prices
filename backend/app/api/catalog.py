from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from app.deps import SessionDep, SettingsDep
from app.models import Category, Import, Product
from app.services.app_settings import public_settings
from app.services.search import (
    SearchParams,
    display_price,
    product_brief,
    product_full,
    search_products,
)
from app.services.specs import FEATURE_LABELS, FORM_LABELS, KIND_LABELS, SPEC_LABELS, SPEC_ORDER, TECH_LABELS

router = APIRouter(tags=["catalog"])


def _csv(values: list[str] | None) -> list[str]:
    out: list[str] = []
    for v in values or []:
        out += [x.strip() for x in v.split(",") if x.strip()]
    return out


def _visible():  # noqa: ANN202
    return [
        Product.is_active.is_(True),
        Product.is_hidden.is_(False),
        or_(Product.category_id.is_(None), Category.is_visible.is_(True)),
    ]


@router.get("/settings/public")
async def get_public_settings(session: SessionDep, settings: SettingsDep) -> dict[str, Any]:
    last = (
        await session.execute(
            select(Import.created_at).where(Import.status == "done").order_by(Import.id.desc()).limit(1)
        )
    ).scalar_one_or_none()
    total = (
        await session.execute(
            select(func.count()).select_from(Product).outerjoin(Category).where(*_visible())
        )
    ).scalar_one()
    return {
        "settings": public_settings(settings),
        "catalog": {"updated_at": last.isoformat() if last else None, "total": total},
        "labels": {
            "kinds": KIND_LABELS,
            "forms": FORM_LABELS,
            "tech": TECH_LABELS,
            "features": FEATURE_LABELS,
            "specs": SPEC_LABELS,
        },
    }


@router.get("/catalog/breakdown")
async def breakdown(session: SessionDep, settings: SettingsDep) -> dict[str, Any]:
    """Counts by (kind, technology, form_factor) — the sidebar sums them for each navigation preset."""
    conds = list(_visible())
    if settings.get("hide_eol"):
        conds.append(Product.is_eol.is_(False))
    rows = (
        await session.execute(
            select(Product.kind, Product.technology, Product.form_factor, func.count())
            .select_from(Product)
            .outerjoin(Category)
            .where(*conds)
            .group_by(Product.kind, Product.technology, Product.form_factor)
        )
    ).all()
    new = (
        await session.execute(
            select(func.count()).select_from(Product).outerjoin(Category).where(*conds, Product.is_new.is_(True))
        )
    ).scalar_one()
    return {
        "rows": [{"kind": k, "tech": t, "form": f, "count": n} for k, t, f, n in rows],
        "new": new,
    }


@router.get("/categories")
async def categories(session: SessionDep) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(Category, func.count(Product.id))
            .outerjoin(Product, (Product.category_id == Category.id) & Product.is_active.is_(True)
                       & Product.is_hidden.is_(False))
            .where(Category.is_visible.is_(True))
            .group_by(Category.id)
            .order_by(Category.sort_order)
        )
    ).all()
    return [
        {"slug": c.slug, "name": c.name, "icon": c.icon, "count": n} for c, n in rows if n > 0
    ]


@router.get("/products")
async def list_products(
    session: SessionDep,
    settings: SettingsDep,
    q: str = "",
    smart: bool = True,
    category: Annotated[list[str] | None, Query()] = None,
    kind: Annotated[list[str] | None, Query()] = None,
    tech: Annotated[list[str] | None, Query()] = None,
    form: Annotated[list[str] | None, Query()] = None,
    mp: Annotated[list[str] | None, Query()] = None,
    features: Annotated[list[str] | None, Query()] = None,
    price_min: float | None = None,
    price_max: float | None = None,
    lens: float | None = None,
    ir_min: int | None = None,
    channels: int | None = None,
    is_new: bool = False,
    eol: str = "default",
    sort: str = "relevance",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int | None, Query(ge=1, le=200)] = None,
    facets: bool = True,
) -> dict[str, Any]:
    mp_vals: list[float] = []
    for v in _csv(mp):
        try:
            mp_vals.append(float(v))
        except ValueError:
            pass
    params = SearchParams(
        q=q[:200],
        smart=smart,
        category=_csv(category),
        kind=_csv(kind),
        tech=_csv(tech),
        form=_csv(form),
        mp=mp_vals,
        features=_csv(features),
        price_min=price_min,
        price_max=price_max,
        lens=lens,
        ir_min=ir_min,
        channels=channels,
        is_new=is_new,
        eol=eol,
        sort=sort,
        page=page,
        page_size=page_size or int(settings.get("page_size") or 30),
    )
    return await search_products(session, params, settings, with_facets=facets)


@router.get("/products/suggest")
async def suggest(session: SessionDep, settings: SettingsDep, q: str = "") -> dict[str, Any]:
    q = q.strip()[:120]
    if len(q) < 2:
        return {"items": [], "chips": [], "categories": []}
    limit = int(settings.get("search_suggest_limit") or 8)
    res = await search_products(
        session, SearchParams(q=q, page_size=limit), settings, with_facets=False
    )
    cats = (
        await session.execute(
            select(Category.slug, Category.name)
            .where(Category.is_visible.is_(True), Category.name.ilike(f"%{q}%"))
            .order_by(Category.sort_order)
            .limit(4)
        )
    ).all()
    return {
        "items": [
            {
                "id": it["id"],
                "model": it["model"],
                "kind": it["kind"],
                "form_factor": it["form_factor"],
                "title": it["title"],
                "price": it["price"],
                "price_on_request": it["price_on_request"],
                "key_specs": it["key_specs"][:4],
                "image_url": it["image_url"],
                "is_eol": it["is_eol"],
                "is_new": it["is_new"],
            }
            for it in res["items"]
        ],
        "total": res["total"],
        "chips": res["query"]["chips"],
        "layout_fixed": res["query"]["layout_fixed"],
        "fuzzy": res["query"]["fuzzy"],
        "categories": [{"slug": s, "name": n} for s, n in cats],
    }


async def _get_by_model(session: SessionDep, model: str) -> Product | None:
    return (
        await session.execute(
            select(Product)
            .outerjoin(Category)
            .where(func.upper(Product.model) == model.upper(), *_visible())
        )
    ).scalar_one_or_none()


@router.get("/products/by-model/{model:path}")
async def product_detail(model: str, session: SessionDep, settings: SettingsDep) -> dict[str, Any]:
    p = await _get_by_model(session, model)
    if p is None:
        raise HTTPException(404, "Товар не найден")
    data = product_full(p, settings)

    # replacement (for EOL) and items replacing this one
    data["replacement"] = None
    if p.replacement_model:
        r = await _get_by_model(session, p.replacement_model)
        if r:
            data["replacement"] = product_brief(r, settings)

    # similar: same kind/form/tech, closest megapixels and price
    limit = int(settings.get("similar_limit") or 8)
    conds = [*_visible(), Product.id != p.id, Product.kind == p.kind]
    if p.form_factor:
        conds.append(Product.form_factor == p.form_factor)
    if p.technology:
        conds.append(Product.technology == p.technology)
    order = []
    if p.megapixels:
        order.append(func.abs(func.coalesce(Product.megapixels, 0) - p.megapixels))
    if p.price is not None:
        order.append(func.abs(func.coalesce(Product.price, 0) - p.price))
    order.append(Product.sort_index)
    similar = (
        await session.execute(select(Product).outerjoin(Category).where(*conds).order_by(*order).limit(limit))
    ).scalars().all()
    data["similar"] = [product_brief(s, settings) for s in similar]

    # same group siblings (e.g. lens variants 2.8/3.6 мм)
    siblings = []
    if p.group_name and p.category_id:
        siblings = (
            await session.execute(
                select(Product)
                .outerjoin(Category)
                .where(*_visible(), Product.group_name == p.group_name,
                       Product.category_id == p.category_id, Product.id != p.id)
                .order_by(Product.sort_index)
                .limit(24)
            )
        ).scalars().all()
    data["siblings"] = [
        {"model": s.model, "title": s.title, "price": display_price(s.price, settings)
         if settings.get("show_prices") else None} for s in siblings
    ]
    return data


@router.get("/compare")
async def compare(
    session: SessionDep,
    settings: SettingsDep,
    models: Annotated[list[str] | None, Query()] = None,
) -> dict[str, Any]:
    wanted = _csv(models)[: max(2, int(settings.get("compare_max") or 6))]
    if not wanted:
        return {"items": [], "rows": []}
    rows = (
        await session.execute(
            select(Product)
            .outerjoin(Category)
            .where(func.upper(Product.model).in_([m.upper() for m in wanted]), *_visible())
        )
    ).scalars().all()
    by_model = {p.model.upper(): p for p in rows}
    products = [by_model[m.upper()] for m in wanted if m.upper() in by_model]
    items = [product_full(p, settings) for p in products]

    spec_keys = [k for k in SPEC_ORDER if any(k in (p.specs or {}) for p in products)]
    spec_table = []
    for k in spec_keys:
        values = [(p.specs or {}).get(k) for p in products]
        spec_table.append(
            {
                "key": k,
                "label": SPEC_LABELS[k],
                "values": values,
                "different": len({str(v) for v in values}) > 1,
            }
        )
    all_features = []
    for p in products:
        for f in p.features or []:
            if f not in all_features and f in FEATURE_LABELS:
                all_features.append(f)
    feature_table = [
        {
            "key": f,
            "label": FEATURE_LABELS[f],
            "values": [f in (p.features or []) for p in products],
            "different": len({f in (p.features or []) for p in products}) > 1,
        }
        for f in sorted(all_features, key=lambda x: list(FEATURE_LABELS).index(x))
    ]
    return {"items": items, "specs": spec_table, "features": feature_table}
