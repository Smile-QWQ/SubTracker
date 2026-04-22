import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import { invalidateWorkerLiteCache, withWorkerLiteCache } from '../services/worker-lite-cache.service'
import { ensureExchangeRates, getLatestSnapshot, refreshExchangeRates } from '../services/exchange-rate.service'

export async function exchangeRateRoutes(app: FastifyInstance) {
  app.get('/exchange-rates/latest', async (_, reply) => {
    const snapshot = await withWorkerLiteCache('exchange-rates', 'latest', () => getLatestSnapshot(), 30)
    return sendOk(reply, snapshot)
  })

  app.post('/exchange-rates/refresh', async (_, reply) => {
    try {
      await refreshExchangeRates()
      await invalidateWorkerLiteCache(['exchange-rates', 'statistics'])
      const latest = await ensureExchangeRates()
      return sendOk(reply, latest)
    } catch (error) {
      return sendError(reply, 500, 'refresh_failed', 'Failed to refresh exchange rates', error)
    }
  })
}
