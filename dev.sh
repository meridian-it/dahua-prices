#!/usr/bin/env bash
# Local development without Docker.
#
#   ./dev.sh          start everything (Postgres + API with reload + Next.js dev)
#   ./dev.sh reset    wipe the local dev database (re-imports seed on next start)
#   ./dev.sh test     run backend tests
#
# Needs: python3 (3.12+), node + npm, PostgreSQL binaries (initdb/pg_ctl) — no root, no running service:
# a private cluster is created in .dev/pgdata. Or set DATABASE_URL to use an existing Postgres
# (requires the pg_trgm extension).
#
# Ports (override via env): BACKEND_PORT=8000 FRONTEND_PORT=3000 PGPORT=54329

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV="$ROOT/.dev"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
PGPORT="${PGPORT:-54329}"
PGDATA="$DEV/pgdata"
PGSOCK="$DEV/run"
PGLOG="$DEV/postgres.log"
DB_NAME="ittrade"

c_blue=$'\e[34m'; c_green=$'\e[32m'; c_yellow=$'\e[33m'; c_red=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
say()  { printf '%s▸%s %s\n' "$c_blue" "$c_off" "$*"; }
ok()   { printf '%s✓%s %s\n' "$c_green" "$c_off" "$*"; }
warn() { printf '%s!%s %s\n' "$c_yellow" "$c_off" "$*"; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }

# values from .env (secrets/admin) without exporting everything into the shell
env_get() {
  [[ -f "$ROOT/.env" ]] || return 0
  grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

# ---------------------------------------------------------------- postgres

find_pg_bin() {
  if command -v pg_ctl >/dev/null 2>&1; then dirname "$(command -v pg_ctl)"; return; fi
  local d
  for d in /usr/lib/postgresql/*/bin /usr/pgsql-*/bin /opt/homebrew/opt/postgresql*/bin /usr/local/opt/postgresql*/bin; do
    [[ -x "$d/pg_ctl" ]] && { echo "$d"; return; }
  done
}

pg_install_hint() {
  local hint="установите PostgreSQL (нужны только бинарники, службу запускать не надо):"
  if command -v pacman >/dev/null; then hint+=$'\n    sudo pacman -S postgresql'
  elif command -v apt-get >/dev/null; then hint+=$'\n    sudo apt install postgresql postgresql-contrib'
  elif command -v dnf >/dev/null; then hint+=$'\n    sudo dnf install postgresql-server postgresql-contrib'
  elif command -v brew >/dev/null; then hint+=$'\n    brew install postgresql@17'
  fi
  hint+=$'\n  или укажите существующую базу: DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db ./dev.sh'
  die "$hint"
}

PG_STARTED_BY_US=0

start_postgres() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    ok "Postgres: внешний (${DATABASE_URL%%@*}@…)"
    return
  fi
  local bin; bin="$(find_pg_bin)"
  [[ -n "$bin" ]] || pg_install_hint
  export PATH="$bin:$PATH"
  mkdir -p "$PGSOCK"

  if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
    say "Создаю локальный кластер Postgres в .dev/pgdata"
    initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null 2>&1 \
      || initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --no-locale >/dev/null
  fi

  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    ok "Postgres уже запущен (порт $PGPORT)"
  else
    say "Запускаю Postgres на порту $PGPORT"
    pg_ctl -D "$PGDATA" -l "$PGLOG" -w -t 30 \
      -o "-p $PGPORT -k $PGSOCK -c listen_addresses=localhost" start >/dev/null \
      || { tail -20 "$PGLOG" >&2; die "Postgres не стартовал (лог: $PGLOG)"; }
    PG_STARTED_BY_US=1
  fi

  if ! psql -h "$PGSOCK" -p "$PGPORT" -U postgres -Atqc "select 1 from pg_database where datname='$DB_NAME'" postgres | grep -q 1; then
    createdb -h "$PGSOCK" -p "$PGPORT" -U postgres "$DB_NAME"
    ok "База $DB_NAME создана"
  fi
  export DATABASE_URL="postgresql+asyncpg://postgres@localhost:$PGPORT/$DB_NAME"
}

stop_postgres() {
  if [[ "$PG_STARTED_BY_US" == 1 ]]; then
    pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 && ok "Postgres остановлен"
  fi
}

# ---------------------------------------------------------------- deps

stamp_changed() { # $1 = file to watch, $2 = stamp file
  [[ ! -f "$2" ]] || [[ "$(sha1sum "$1" | cut -d' ' -f1)" != "$(cat "$2")" ]]
}
stamp_write() { sha1sum "$1" | cut -d' ' -f1 >"$2"; }

setup_backend() {
  command -v python3 >/dev/null || die "Нужен python3"
  if [[ ! -x "$VENV/bin/python" ]]; then
    say "Создаю venv backend/.venv"
    python3 -m venv "$VENV"
  fi
  local req_all="$DEV/requirements.all"
  mkdir -p "$DEV"
  cat "$BACKEND/requirements.txt" "$BACKEND/requirements-dev.txt" >"$req_all"
  if stamp_changed "$req_all" "$VENV/.deps-stamp"; then
    say "Устанавливаю Python-зависимости"
    "$VENV/bin/pip" install -q --disable-pip-version-check -r "$req_all"
    stamp_write "$req_all" "$VENV/.deps-stamp"
  fi
  ok "Backend: зависимости на месте"
}

setup_frontend() {
  command -v npm >/dev/null || die "Нужны node и npm"
  if [[ ! -d "$FRONTEND/node_modules" ]] || stamp_changed "$FRONTEND/package-lock.json" "$FRONTEND/node_modules/.deps-stamp"; then
    say "npm install"
    (cd "$FRONTEND" && npm install --no-audit --no-fund --loglevel=error)
    stamp_write "$FRONTEND/package-lock.json" "$FRONTEND/node_modules/.deps-stamp"
  fi
  ok "Frontend: зависимости на месте"
}

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# ---------------------------------------------------------------- commands

cmd_reset() {
  local bin; bin="$(find_pg_bin)"
  if [[ -n "$bin" && -d "$PGDATA" ]]; then "$bin/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; fi
  rm -rf "$PGDATA" "$DEV/data"
  ok "Локальная база удалена — при следующем ./dev.sh прайс импортируется заново из seed/"
}

cmd_test() {
  setup_backend
  cd "$BACKEND" && exec "$VENV/bin/python" -m pytest -q "$@"
}

cmd_start() {
  for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    port_busy "$p" && die "Порт $p занят (задайте BACKEND_PORT / FRONTEND_PORT)"
  done

  setup_backend
  setup_frontend
  start_postgres

  local admin_user admin_pass jwt
  admin_user="$(env_get ADMIN_USERNAME)"; admin_pass="$(env_get ADMIN_PASSWORD)"; jwt="$(env_get JWT_SECRET)"
  export ADMIN_USERNAME="${ADMIN_USERNAME:-${admin_user:-admin}}"
  export ADMIN_PASSWORD="${ADMIN_PASSWORD:-${admin_pass:-admin}}"
  export JWT_SECRET="${JWT_SECRET:-$jwt}"
  export DATA_DIR="$DEV/data"
  export SEED_DIR="$ROOT/seed"
  export COOKIE_SECURE=false
  mkdir -p "$DATA_DIR"

  cd "$BACKEND"
  say "Миграции"
  "$VENV/bin/alembic" upgrade head 2>&1 | grep -v "^INFO  \[alembic.runtime" || true
  say "Bootstrap (админ, импорт seed при пустом каталоге)"
  "$VENV/bin/python" -m app.bootstrap 2>&1 | sed "s/^/  ${c_dim}/;s/$/${c_off}/"

  PIDS=()
  cleanup() {
    trap - INT TERM EXIT
    echo
    say "Останавливаю…"
    for pid in "${PIDS[@]}"; do
      pkill -TERM -P "$pid" 2>/dev/null || true   # children: uvicorn reloader worker, next-server
      kill -TERM "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    stop_postgres
  }
  trap cleanup INT TERM EXIT

  # process substitution keeps $! pointing at the server itself (not at the log prefixer)
  "$VENV/bin/uvicorn" app.main:app --reload --reload-dir app --host 127.0.0.1 --port "$BACKEND_PORT" \
    > >(sed -u "s/^/${c_blue}[api]${c_off} /") 2>&1 &
  PIDS+=($!)

  cd "$FRONTEND"
  DEV_API_PROXY="http://127.0.0.1:$BACKEND_PORT" INTERNAL_API_URL="http://127.0.0.1:$BACKEND_PORT" \
    ./node_modules/.bin/next dev --port "$FRONTEND_PORT" \
    > >(sed -u "s/^/${c_green}[web]${c_off} /") 2>&1 &
  PIDS+=($!)

  # wait until both answer, then print the summary
  for _ in $(seq 1 60); do
    curl -fs "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
  cat <<EOF

${c_green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c_off}
  Сайт:       http://localhost:$FRONTEND_PORT
  Админка:    http://localhost:$FRONTEND_PORT/admin   (${ADMIN_USERNAME} / пароль из .env)
  API docs:   http://localhost:$BACKEND_PORT/api/docs
  Postgres:   $(sed -E 's#://([^:@]+):[^@]*@#://\1:***@#' <<<"$DATABASE_URL")
  Остановить: Ctrl+C
${c_green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c_off}

EOF
  wait
}

case "${1:-start}" in
  start) cmd_start ;;
  reset) cmd_reset ;;
  test) shift; cmd_test "$@" ;;
  *) die "Использование: ./dev.sh [start|reset|test]" ;;
esac
