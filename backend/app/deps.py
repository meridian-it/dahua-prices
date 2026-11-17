from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.security import decode_token
from app.services.app_settings import load_settings

SessionDep = Annotated[AsyncSession, Depends(get_session)]
bearer = HTTPBearer(auto_error=False)


async def get_settings(session: SessionDep) -> dict[str, Any]:
    return await load_settings(session)


SettingsDep = Annotated[dict[str, Any], Depends(get_settings)]


async def get_current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Требуется авторизация", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    try:
        payload = decode_token(creds.credentials, "access")
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Токен истёк", headers={"WWW-Authenticate": "Bearer"}
        ) from e
    except jwt.InvalidTokenError as e:
        raise unauthorized from e
    user = await session.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise unauthorized
    return user


AdminDep = Annotated[User, Depends(get_current_user)]
