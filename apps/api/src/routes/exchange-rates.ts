import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import { getCacheVersion } from '../services/cache-version.service'
import { invalidateWorkerLiteCache } from '../services/worker-lite-cache.service'
import { ensureExchangeRates, getLatestSnapshot, refreshExchangeRates } from '../services/exchange-rate.service'
import { withWorkerTieredCache } from '../services/worker-tiered-cache.service'

const EXCHANGE_RATE_RESPONSE_CACHE_TTL_SECONDS = 5 * 60

export async function exchangeRateRoutes(app: FastifyInstance) {
  app.get('/exchange-rates/latest', async (_, reply) => {
    const version = await getCacheVersion('exchangeRates')
    const snapshot = await withWorkerTieredCache(
      'exchange-rates',
      `latest:v${version}`,
      () => getLatestSnapshot(),
      EXCHANGE_RATE_RESPONSE_CACHE_TTL_SECONDS
    )
    return sendOk(reply, snapshot)
  })

  app.post('/exchange-rates/refresh', async (_, reply) => {
    try {
      await refreshExchangeRates()
      await invalidateWorkerLiteCache(['exchange-rates', 'statistics', 'calendar'])
      const latest = await ensureExchangeRates()
      return sendOk(reply, latest)
    } catch (error) {
      return sendError(reply, 500, 'refresh_failed', 'Failed to refresh exchange rates', error)
    }
  })
}
