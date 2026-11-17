"""One-shot startup tasks, run by the entrypoint before the API workers start:
create the first admin and import the seed price-list into an empty catalog."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from sqlalchemy import func, select

from app.config import env
from app.db import SessionLocal, engine
from app.models import Product, User
from app.security import hash_password
from app.services.app_settings import load_settings
from app.services.importer import run_import

log = logging.getLogger("it-trade")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

SEED_DIR = Path(os.environ.get("SEED_DIR", "/seed"))


async def bootstrap() -> None:
    async with SessionLocal() as session:
        users = (await session.execute(select(func.count()).select_from(User))).scalar_one()
        if users == 0:
            session.add(User(username=env.admin_username, password_hash=hash_password(env.admin_password)))
            await session.commit()
            log.info("Created initial admin user %r", env.admin_username)

        products = (await session.execute(select(func.count()).select_from(Product))).scalar_one()
        if products == 0 and SEED_DIR.is_dir():
            files = sorted(SEED_DIR.glob("*.xlsx"))
            if files:
                log.info("Empty catalog — importing seed file %s", files[0].name)
                try:
                    settings = await load_settings(session, fresh=True)
                    stats = await run_import(
                        session, files[0].read_bytes(), files[0].name, settings, user_id=None
                    )
                    log.info("Seed import done: %s products", stats["created"])
                except Exception:  # pragma: no cover - never block startup
                    log.exception("Seed import failed")
                    await session.rollback()



async def main() -> None:
    try:
        await bootstrap()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
