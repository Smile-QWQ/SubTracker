import { getMessage } from '@subtracker/shared'
import { DEFAULT_APP_LOCALE } from '@subtracker/shared/locale-core'
import { buildApp } from './app'
import { config } from './config'
import { startSchedulers } from './services/scheduler.service'
import { refreshExchangeRates } from './services/exchange-rate.service'

async function start() {
  const app = await buildApp()

  try {
    await refreshExchangeRates()
  } catch (error) {
    console.warn(getMessage(DEFAULT_APP_LOCALE, 'api.runtime.initialExchangeRateRefreshFailed'), error)
  }

  startSchedulers()

  await app.listen({ port: config.port, host: config.host })
  console.log(getMessage(DEFAULT_APP_LOCALE, 'api.runtime.started', { host: config.host, port: config.port }))
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
