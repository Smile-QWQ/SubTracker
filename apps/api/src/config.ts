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
