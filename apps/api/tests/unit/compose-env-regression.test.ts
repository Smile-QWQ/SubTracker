import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('docker compose environment wiring', () => {
  it('streams native backups through the proxy without logging download capabilities', () => {
    const nginx = readFileSync(new URL('../../../../docker/nginx.full.conf', import.meta.url), 'utf8')
    const upload = nginx.split('location = /api/v1/import/subtracker/inspect {')[1].split('}')[0]
    expect(upload).toContain('client_max_body_size 0;')
    expect(upload).toContain('proxy_request_buffering off;')
    expect(upload).toContain('proxy_read_timeout 1800s;')
    const download = nginx.split('location /api/v1/settings/export/backup {')[1].split('}')[0]
    expect(download).toContain('access_log off;')
    expect(download).toContain('proxy_buffering off;')
  })

  it('ignores private dev files and keeps container temp files in the existing data mount', () => {
    const ignore = readFileSync(new URL('../../../../.gitignore', import.meta.url), 'utf8')
    const dockerIgnore = readFileSync(new URL('../../../../.dockerignore', import.meta.url), 'utf8')
    const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8')
    expect(ignore).toContain('apps/api/storage/')
    expect(ignore).not.toContain('apps/api/apps/api/storage/')
    expect(dockerIgnore).not.toContain('apps/api/apps/api/storage/')
    expect(dockerIgnore).toContain('apps/api/storage/')
    expect(dockerIgnore).toContain('apps/api/prisma/*.db*')
    expect(dockerfile).toContain('ENV BACKUP_TEMP_DIR=/app/data/backup-temp')
  })

  it('preserves v0.11.0 database, data and logo mounts without requiring new environment values', () => {
    for (const file of ['docker-compose.yml', 'docker-compose.full.yml']) {
      const compose = readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8')
      expect(compose).toContain('DATABASE_URL: ${DATABASE_URL:-file:/app/data/subtracker.db}')
      expect(compose).toContain('./data:/app/data')
      expect(compose).toContain('./data/logos:/app/apps/api/storage/logos')
      expect(compose).not.toMatch(/BACKUP_\w+:\s*\$\{[^}:]+\}/)
    }
    const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8')
    expect(dockerfile).toContain('WORKDIR /app')
    expect(dockerfile).toContain('ENV SUBSCRIPTION_IMAGE_STORAGE_DIR=/app/data/subscription-images')
    expect(dockerfile).toContain('ENV BACKUP_TEMP_DIR=/app/data/backup-temp')
    const entrypoint = readFileSync(new URL('../../../../docker/entrypoint.sh', import.meta.url), 'utf8')
    expect(entrypoint).toContain('"$PRISMA_BIN" db push --skip-generate --schema "$SCHEMA_PATH"')
    expect(entrypoint).not.toMatch(/--force-reset|--accept-data-loss/)
  })

  it('passes DEFAULT_APP_LOCALE into the api-only compose service', () => {
    const compose = readFileSync(new URL('../../../../docker-compose.yml', import.meta.url), 'utf8')

    expect(compose).toContain('DEFAULT_APP_LOCALE: ${DEFAULT_APP_LOCALE:-zh-CN}')
  })

  it('keeps the full compose api environment aligned with the api-only deployment defaults', () => {
    const compose = readFileSync(new URL('../../../../docker-compose.full.yml', import.meta.url), 'utf8')

    for (const entry of [
      'PORT: ${PORT:-3001}',
      'HOST: ${HOST:-0.0.0.0}',
      'DATABASE_URL: ${DATABASE_URL:-file:/app/data/subtracker.db}',
      'WEB_ORIGIN: ${WEB_ORIGIN:-https://subtracker.example.com}',
      'BASE_CURRENCY: ${BASE_CURRENCY:-CNY}',
      'CRON_SCAN: "${CRON_SCAN:-* * * * *}"',
      'CRON_REFRESH_RATES: "${CRON_REFRESH_RATES:-0 2 * * *}"',
      'LOG_LEVEL: ${LOG_LEVEL:-warn}',
      'BACKUP_MAX_ARCHIVE_MIB: ${BACKUP_MAX_ARCHIVE_MIB:-2048}',
      'BACKUP_MAX_EXPANDED_MIB: ${BACKUP_MAX_EXPANDED_MIB:-2048}',
      'BACKUP_TEMP_MAX_MIB: ${BACKUP_TEMP_MAX_MIB:-}',
      'DEFAULT_APP_LOCALE: ${DEFAULT_APP_LOCALE:-zh-CN}',
      'TZ: ${TZ:-Asia/Shanghai}'
    ]) {
      expect(compose).toContain(entry)
    }
  })
})
