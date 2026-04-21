#!/bin/sh
set -eu

APP_ROOT="/app"
SCHEMA_PATH="$APP_ROOT/apps/api/prisma/schema.prisma"
PRISMA_BIN="$APP_ROOT/node_modules/.bin/prisma"

mkdir -p "$APP_ROOT/data" "$APP_ROOT/apps/api/storage/logos"

if [ -n "${TZ:-}" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
  ln -sf "/usr/share/zoneinfo/$TZ" /etc/localtime
  echo "$TZ" > /etc/timezone
fi

if [ "${SKIP_DB_PUSH:-false}" != "true" ]; then
  if [ ! -x "$PRISMA_BIN" ]; then
    echo "[api] 未找到 Prisma CLI：$PRISMA_BIN" >&2
    exit 1
  fi

  if [ ! -f "$SCHEMA_PATH" ]; then
    echo "[api] 未找到 Prisma schema：$SCHEMA_PATH" >&2
    exit 1
  fi

  echo "[api] 正在检查并初始化数据库结构..."
  "$PRISMA_BIN" db push --skip-generate --schema "$SCHEMA_PATH"
fi

exec node "$APP_ROOT/apps/api/dist/index.js"
