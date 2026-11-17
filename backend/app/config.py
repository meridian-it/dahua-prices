"""Environment configuration: only secrets and deploy-specific values live here.

Everything business-related (brand, contacts, import rules, search synonyms...) is a
runtime setting stored in the database and editable in the admin panel
(see app/services/app_settings.py).
"""

from functools import lru_cache
import secrets
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Env(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    postgres_user: str = "ittrade"
    postgres_password: str = "ittrade"
    postgres_db: str = "ittrade"
    postgres_host: str = "db"
    postgres_port: int = 5432
    database_url: str | None = None

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    admin_username: str = "admin"
    admin_password: str = "admin"

    cookie_secure: bool = False
    cors_origins: list[str] = Field(default_factory=list)
    max_upload_mb: int = 50
    data_dir: Path = Path("/data")

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    def resolved_jwt_secret(self) -> str:
        """Use JWT_SECRET from env, otherwise a random secret persisted in the data volume."""
        if self.jwt_secret:
            return self.jwt_secret
        path = self.data_dir / "jwt_secret"
        try:
            if path.exists():
                return path.read_text().strip()
            self.data_dir.mkdir(parents=True, exist_ok=True)
            value = secrets.token_urlsafe(64)
            path.write_text(value)
            return value
        except OSError:
            # read-only FS: fall back to a per-process secret (tokens die on restart)
            return secrets.token_urlsafe(64)


@lru_cache
def get_env() -> Env:
    return Env()


env = get_env()
JWT_SECRET = env.resolved_jwt_secret()
