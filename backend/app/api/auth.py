from __future__ import annotations

import uuid
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.config import env
from app.deps import AdminDep, SessionDep
from app.models import RefreshToken, User
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    login_limiter,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "it_refresh"
COOKIE_PATH = "/api/auth"


class LoginIn(BaseModel):
    username: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str | None = None


def _user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username}


async def _issue(session: SessionDep, response: Response, user: User, request: Request,
                 family: uuid.UUID | None = None) -> dict:
    access, ttl = create_access_token(user.id, user.username)
    refresh, jti, fam, exp = create_refresh_token(user.id, family)
    session.add(
        RefreshToken(
            jti=jti,
            user_id=user.id,
            family=fam,
            expires_at=exp,
            user_agent=(request.headers.get("user-agent") or "")[:255],
        )
    )
    await session.commit()
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        max_age=env.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=env.cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )
    return {
        "access_token": access,
        "token_type": "bearer",
        "expires_in": ttl,
        "user": _user_out(user),
    }


@router.post("/login")
async def login(data: LoginIn, request: Request, response: Response, session: SessionDep) -> dict:
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "?")
    key = f"{ip}:{data.username.lower()}"
    if not login_limiter.hit(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Слишком много попыток, попробуйте позже")
    user = (
        await session.execute(select(User).where(User.username == data.username.strip()))
    ).scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")
    login_limiter.reset(key)
    user.last_login_at = datetime.now(UTC)
    return await _issue(session, response, user, request)


@router.post("/refresh", response_model=None, responses={204: {"description": "Нет сессии (cookie отсутствует)"}})
async def refresh(request: Request, response: Response, session: SessionDep,
                  data: RefreshIn | None = None) -> dict | Response:
    token = (data.refresh_token if data else None) or request.cookies.get(REFRESH_COOKIE)
    fail = HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла, войдите снова")
    if not token:
        # Not logged in at all is a normal state, not an error (keeps browser consoles clean).
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        payload = decode_token(token, "refresh")
    except jwt.InvalidTokenError as e:
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        raise fail from e

    jti = uuid.UUID(payload["jti"])
    stored = await session.get(RefreshToken, jti)
    now = datetime.now(UTC)
    if stored is None or stored.expires_at < now:
        raise fail
    if stored.revoked_at is not None:
        # Reuse of a rotated token: someone may have stolen it -> kill the whole family.
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.family == stored.family, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await session.commit()
        raise fail
    user = await session.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise fail
    stored.revoked_at = now
    return await _issue(session, response, user, request, family=stored.family)


@router.post("/logout")
async def logout(request: Request, response: Response, session: SessionDep,
                 data: RefreshIn | None = None) -> dict:
    token = (data.refresh_token if data else None) or request.cookies.get(REFRESH_COOKIE)
    if token:
        try:
            payload = decode_token(token, "refresh")
            stored = await session.get(RefreshToken, uuid.UUID(payload["jti"]))
            if stored is not None:
                await session.execute(
                    update(RefreshToken)
                    .where(RefreshToken.family == stored.family, RefreshToken.revoked_at.is_(None))
                    .values(revoked_at=datetime.now(UTC))
                )
                await session.commit()
        except jwt.InvalidTokenError:
            pass
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return {"ok": True}


@router.get("/me")
async def me(user: AdminDep) -> dict:
    return _user_out(user)
