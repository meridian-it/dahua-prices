from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.config import JWT_SECRET, env


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm=env.jwt_algorithm)


def create_access_token(user_id: int, username: str) -> tuple[str, int]:
    ttl = env.access_token_ttl_minutes * 60
    now = datetime.now(UTC)
    token = _encode(
        {
            "sub": str(user_id),
            "name": username,
            "type": "access",
            "iat": now,
            "exp": now + timedelta(seconds=ttl),
        }
    )
    return token, ttl


def create_refresh_token(user_id: int, family: uuid.UUID | None = None) -> tuple[str, uuid.UUID, uuid.UUID, datetime]:
    jti = uuid.uuid4()
    family = family or uuid.uuid4()
    now = datetime.now(UTC)
    exp = now + timedelta(days=env.refresh_token_ttl_days)
    token = _encode(
        {"sub": str(user_id), "type": "refresh", "jti": str(jti), "fam": str(family), "iat": now, "exp": exp}
    )
    return token, jti, family, exp


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[env.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


class RateLimiter:
    """Tiny in-memory sliding-window limiter (per process) for the login endpoint."""

    def __init__(self, limit: int, window_sec: int):
        self.limit = limit
        self.window = window_sec
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def reset(self, key: str) -> None:
        self.hits.pop(key, None)


login_limiter = RateLimiter(limit=10, window_sec=300)
