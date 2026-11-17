from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.config import env
from app.deps import AdminDep, SessionDep, SettingsDep
from app.models import Category, Import, Job, Product, RefreshToken, User
from app.security import hash_password, verify_password
from app.services.app_settings import (
    SETTINGS_SCHEMA,
    SettingsValidationError,
    load_settings,
    save_settings,
)
from app.services import photos
from app.services.importer import build_search_text, reindex_all, run_import
from app.services.search import SearchParams, product_full, search_products

router = APIRouter(prefix="/admin", tags=["admin"])


# ------------------------------------------------------------------ dashboard


@router.get("/stats")
async def stats(session: SessionDep, _: AdminDep) -> dict[str, Any]:
    async def count(*where: Any) -> int:
        return (await session.execute(select(func.count()).select_from(Product).where(*where))).scalar_one()

    last_imports = (
        await session.execute(select(Import).order_by(Import.id.desc()).limit(5))
    ).scalars().all()
    return {
        "products": await count(Product.is_active.is_(True)),
        "inactive": await count(Product.is_active.is_(False)),
        "hidden": await count(Product.is_hidden.is_(True)),
        "new": await count(Product.is_active.is_(True), Product.is_new.is_(True)),
        "eol": await count(Product.is_active.is_(True), Product.is_eol.is_(True)),
        "cameras": await count(Product.is_active.is_(True), Product.kind == "camera"),
        "without_photo": await count(Product.is_active.is_(True), Product.image_url.is_(None)),
        "with_photo": await count(Product.is_active.is_(True), Product.image_url.is_not(None)),
        "without_price": await count(Product.is_active.is_(True), Product.price.is_(None)),
        "categories": (await session.execute(select(func.count()).select_from(Category))).scalar_one(),
        "last_imports": [_import_out(i) for i in last_imports],
    }


# ------------------------------------------------------------------ imports


def _import_out(i: Import) -> dict[str, Any]:
    return {
        "id": i.id,
        "filename": i.filename,
        "status": i.status,
        "created_at": i.created_at.isoformat(),
        "stats": i.stats,
        "error": i.error,
    }


@router.post("/imports")
async def upload_import(
    session: SessionDep,
    settings: SettingsDep,
    user: AdminDep,
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
) -> dict[str, Any]:
    name = file.filename or "upload.xlsx"
    if not name.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нужен файл Excel (.xlsx)")
    data = await file.read(env.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > env.max_upload_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Файл больше {env.max_upload_mb} МБ")
    try:
        result = await run_import(session, data, name, settings, user_id=user.id, dry_run=dry_run)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    except Exception as e:  # corrupted workbook etc.
        await session.rollback()
        session.add(Import(filename=name, user_id=user.id, status="error", error=str(e)[:2000]))
        await session.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Не удалось прочитать файл: {e}") from e
    if not dry_run and settings.get("photos_enabled") and settings.get("photos_auto"):
        await photos.start_job("missing", user.id, quiet=True)
    return {"dry_run": dry_run, "stats": result}


@router.get("/imports")
async def list_imports(session: SessionDep, _: AdminDep, limit: int = 50) -> list[dict[str, Any]]:
    rows = (await session.execute(select(Import).order_by(Import.id.desc()).limit(min(limit, 200)))).scalars()
    return [_import_out(i) for i in rows]


@router.post("/reindex")
async def reindex(session: SessionDep, _: AdminDep) -> dict[str, Any]:
    return {"reindexed": await reindex_all(session)}


# ------------------------------------------------------------------ settings


@router.get("/settings")
async def get_settings_admin(session: SessionDep, _: AdminDep) -> dict[str, Any]:
    return {"schema": SETTINGS_SCHEMA, "values": await load_settings(session, fresh=True)}


@router.put("/settings")
async def put_settings(values: dict[str, Any], session: SessionDep, _: AdminDep) -> dict[str, Any]:
    try:
        saved = await save_settings(session, values)
    except SettingsValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"errors": e.errors}) from e
    return {"schema": SETTINGS_SCHEMA, "values": saved}


# ------------------------------------------------------------------ products


@router.get("/products")
async def admin_products(
    session: SessionDep,
    settings: SettingsDep,
    _: AdminDep,
    q: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    params = SearchParams(q=q, page=page, page_size=page_size, include_inactive=True, eol="include",
                          sort="relevance" if q else "model")
    res = await search_products(session, params, {**settings, "show_prices": True}, with_facets=False)
    ids = [it["id"] for it in res["items"]]
    extra = {
        p.id: p
        for p in (await session.execute(select(Product).where(Product.id.in_(ids)))).scalars()
    } if ids else {}
    for it in res["items"]:
        p = extra[it["id"]]
        it["is_active"] = p.is_active
        it["is_hidden"] = p.is_hidden
        it["photo_meta"] = p.photo_meta
        it["base_price"] = float(p.price) if p.price is not None else None
    return res


class ProductPatch(BaseModel):
    image_url: str | None = None
    images: list[str] | None = None
    is_hidden: bool | None = None
    title: str | None = None


@router.get("/products/{product_id}")
async def admin_product(product_id: int, session: SessionDep, settings: SettingsDep, _: AdminDep) -> dict:
    p = await session.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "Товар не найден")
    return _admin_product_out(p, settings)


def _admin_product_out(p: Product, settings: dict[str, Any]) -> dict[str, Any]:
    d = product_full(p, {**settings, "show_prices": True})
    d.update({"is_active": p.is_active, "is_hidden": p.is_hidden, "photo_meta": p.photo_meta})
    return d


@router.patch("/products/{product_id}")
async def patch_product(product_id: int, data: ProductPatch, session: SessionDep, settings: SettingsDep,
                        _: AdminDep) -> dict:
    p = await session.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "Товар не найден")
    patch = data.model_dump(exclude_unset=True)
    if "image_url" in patch:
        p.image_url = (patch["image_url"] or "").strip() or None
    if "images" in patch:
        p.images = [u.strip() for u in patch["images"] or [] if u and u.strip()]
        if p.images and not p.image_url:
            p.image_url = p.images[0]
    if "image_url" in patch or "images" in patch:
        if not p.image_url and p.images:
            p.image_url = p.images[0]
        # photos edited by hand are never overwritten by the automatic fetcher
        p.photo_meta = {"status": "manual", "checked_at": datetime.now(UTC).isoformat()}
    if "is_hidden" in patch:
        p.is_hidden = bool(patch["is_hidden"])
    if patch.get("title"):
        p.title = patch["title"].strip()
        p.search_text = build_search_text(p, p.category.name if p.category else None)
    await session.commit()
    return _admin_product_out(p, settings)


class PhotoBulkItem(BaseModel):
    model: str
    image_url: str | None = None
    images: list[str] = Field(default_factory=list)


@router.post("/products/photos")
async def bulk_photos(items: list[PhotoBulkItem], session: SessionDep, _: AdminDep) -> dict[str, Any]:
    """Bulk attach photos by model — entry point for the future photo parser."""
    models = {i.model.upper(): i for i in items}
    found = (
        await session.execute(select(Product).where(func.upper(Product.model).in_(list(models))))
    ).scalars().all()
    for p in found:
        it = models[p.model.upper()]
        imgs = [u for u in it.images if u]
        p.images = imgs
        p.image_url = it.image_url or (imgs[0] if imgs else None)
        p.photo_meta = {"status": "manual", "checked_at": datetime.now(UTC).isoformat()}
    await session.commit()
    matched = {p.model.upper() for p in found}
    return {"updated": len(found), "not_found": [m for m in models if m not in matched]}


# ------------------------------------------------------------------ photos


@router.post("/products/{product_id}/photos/fetch")
async def fetch_product_photos(product_id: int, settings: SettingsDep, _: AdminDep) -> dict:
    p = await photos.fetch_one(product_id)
    if p is None:
        raise HTTPException(404, "Товар не найден")
    return _admin_product_out(p, settings)


@router.get("/photos")
async def photos_status(session: SessionDep, _: AdminDep) -> dict[str, Any]:
    status_col = Product.photo_meta["status"].astext
    rows = (
        await session.execute(
            select(status_col, func.count()).where(Product.is_active.is_(True)).group_by(status_col)
        )
    ).all()
    counts = {(k or "unchecked"): n for k, n in rows}
    job = await photos.active_job(session)
    last = job or (
        await session.execute(select(Job).where(Job.kind == photos.JOB_KIND).order_by(Job.id.desc()).limit(1))
    ).scalar_one_or_none()
    with_photo = (
        await session.execute(
            select(func.count()).select_from(Product)
            .where(Product.is_active.is_(True), Product.image_url.is_not(None))
        )
    ).scalar_one()
    return {"counts": counts, "with_photo": with_photo, "total": sum(counts.values()),
            "job": photos.job_out(last), "running": job is not None}


class PhotoJobIn(BaseModel):
    mode: str = Field("missing", pattern="^(missing|retry|all)$")


@router.post("/photos/jobs")
async def start_photo_job(data: PhotoJobIn, user: AdminDep) -> dict[str, Any]:
    try:
        job = await photos.start_job(data.mode, user.id)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, "Подбор фото уже идёт") from e
    return {"job": photos.job_out(job)}


@router.post("/photos/jobs/cancel")
async def cancel_photo_job(_: AdminDep) -> dict[str, Any]:
    return {"job": photos.job_out(await photos.cancel_job())}


@router.get("/photos/review")
async def photos_review(session: SessionDep, settings: SettingsDep, _: AdminDep,
                        status_: str = Query("close", alias="status"), page: int = 1, page_size: int = 48) -> dict[str, Any]:
    """Products by photo status - to review close matches or attach missing photos by hand."""
    status_col = Product.photo_meta["status"].astext
    where = [Product.is_active.is_(True)]
    if status_ == "unchecked":
        where.append(status_col.is_(None))
    elif status_ == "missing":
        where.append(Product.image_url.is_(None))
    else:
        where.append(status_col == status_)
    total = (await session.execute(select(func.count()).select_from(Product).where(*where))).scalar_one()
    rows = (
        await session.execute(
            select(Product).where(*where).order_by(Product.kind, Product.model)
            .offset((max(page, 1) - 1) * page_size).limit(min(page_size, 200))
        )
    ).scalars().all()
    return {"total": total, "items": [_admin_product_out(p, settings) for p in rows]}


# ------------------------------------------------------------------ categories


class CategoryPatch(BaseModel):
    name: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None
    icon: str | None = None


@router.get("/categories")
async def admin_categories(session: SessionDep, _: AdminDep) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(Category, func.count(Product.id))
            .outerjoin(Product, (Product.category_id == Category.id) & Product.is_active.is_(True))
            .group_by(Category.id)
            .order_by(Category.sort_order)
        )
    ).all()
    return [
        {"id": c.id, "name": c.name, "source_name": c.source_name, "slug": c.slug,
         "sort_order": c.sort_order, "is_visible": c.is_visible, "icon": c.icon, "count": n}
        for c, n in rows
    ]


@router.patch("/categories/{cat_id}")
async def patch_category(cat_id: int, data: CategoryPatch, session: SessionDep, _: AdminDep) -> dict:
    c = await session.get(Category, cat_id)
    if c is None:
        raise HTTPException(404, "Категория не найдена")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "name" and not (v or "").strip():
            continue
        setattr(c, k, v.strip() if isinstance(v, str) else v)
    await session.commit()
    return {"ok": True}


# ------------------------------------------------------------------ users


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.get("/users")
async def list_users(session: SessionDep, _: AdminDep) -> list[dict[str, Any]]:
    users = (await session.execute(select(User).order_by(User.id))).scalars()
    return [
        {"id": u.id, "username": u.username, "is_active": u.is_active,
         "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None}
        for u in users
    ]


@router.post("/users")
async def create_user(data: UserIn, session: SessionDep, _: AdminDep) -> dict[str, Any]:
    exists = (await session.execute(select(User).where(User.username == data.username))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "Пользователь уже существует")
    u = User(username=data.username.strip(), password_hash=hash_password(data.password))
    session.add(u)
    await session.commit()
    return {"id": u.id, "username": u.username}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, session: SessionDep, me: AdminDep) -> dict[str, Any]:
    if user_id == me.id:
        raise HTTPException(400, "Нельзя удалить самого себя")
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(404, "Пользователь не найден")
    await session.delete(u)
    await session.commit()
    return {"ok": True}


@router.post("/me/password")
async def change_password(data: PasswordIn, session: SessionDep, me: AdminDep) -> dict[str, Any]:
    if not verify_password(data.current_password, me.password_hash):
        raise HTTPException(400, "Текущий пароль неверен")
    me.password_hash = hash_password(data.new_password)
    # revoke all refresh sessions: other devices must log in again with the new password
    await session.execute(
        RefreshToken.__table__.update()
        .where(RefreshToken.user_id == me.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )
    await session.commit()
    return {"ok": True}
