from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import admin, auth, catalog
from app.config import env
from app.db import SessionLocal, engine
from app.services import photos


@asynccontextmanager
async def lifespan(_: FastAPI):  # noqa: ANN201
    auto = asyncio.create_task(photos.autostart())
    yield
    auto.cancel()
    await engine.dispose()


app = FastAPI(
    title="IT-Trade Price API",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

if env.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=env.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )



class MediaFiles(StaticFiles):
    """Stored photos have content-addressed names, so browsers may cache them forever."""

    def file_response(self, *args, **kwargs):  # noqa: ANN002, ANN003, ANN201
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp


photos.media_dir().mkdir(parents=True, exist_ok=True)
app.mount("/api/media", MediaFiles(directory=photos.media_dir()), name="media")

app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict[str, str]:
    async with SessionLocal() as session:
        await session.execute(text("select 1"))
    return {"status": "ok"}
