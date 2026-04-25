import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

let envFileLoaded = false

function loadApiEnvFile() {
  if (envFileLoaded) return
  envFileLoaded = true

  const candidates = [path.resolve(process.cwd(), 'apps/api/.env'), path.resolve(process.cwd(), '.env')]

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue

      const [, key, rawValue] = match
      if (process.env[key] !== undefined) continue

      let value = rawValue.trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      process.env[key] = value
    }

    break
  }
}

loadApiEnvFile()

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  baseCurrency: (process.env.BASE_CURRENCY ?? 'CNY').toUpperCase(),
  defaultNotifyDays: Number(process.env.DEFAULT_NOTIFY_DAYS ?? 3),
  exchangeRateProvider: process.env.EXCHANGE_RATE_PROVIDER ?? 'ExchangeRate-API',
  exchangeRateUrl: process.env.EXCHANGE_RATE_URL ?? 'https://open.er-api.com/v6/latest',
  cronScan: process.env.CRON_SCAN ?? '* * * * *',
  cronRefreshRates: process.env.CRON_REFRESH_RATES ?? '0 2 * * *'
}
