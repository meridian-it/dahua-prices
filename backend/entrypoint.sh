#!/bin/sh
set -e

echo "→ Applying database migrations"
alembic upgrade head

echo "→ Bootstrap (admin user, seed catalog)"
python -m app.bootstrap

echo "→ Starting API"
exec uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 \
  --workers "${WEB_CONCURRENCY:-2}" \
  --proxy-headers --forwarded-allow-ips="*"
