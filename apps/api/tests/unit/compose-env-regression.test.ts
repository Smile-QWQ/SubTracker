import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('docker compose environment wiring', () => {
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
      'DEFAULT_APP_LOCALE: ${DEFAULT_APP_LOCALE:-zh-CN}',
      'TZ: ${TZ:-Asia/Shanghai}'
    ]) {
      expect(compose).toContain(entry)
    }
  })
})
