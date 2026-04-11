import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import { ensureExchangeRates, getLatestSnapshot, refreshExchangeRates } from '../services/exchange-rate.service'

export async function exchangeRateRoutes(app: FastifyInstance) {
  app.get('/exchange-rates/latest', async (_, reply) => {
    const snapshot = await getLatestSnapshot()
    return sendOk(reply, snapshot)
  })

  app.post('/exchange-rates/refresh', async (_, reply) => {
    try {
      await refreshExchangeRates()
      const latest = await ensureExchangeRates()
      return sendOk(reply, latest)
    } catch (error) {
      return sendError(reply, 500, 'refresh_failed', 'Failed to refresh exchange rates', error)
    }
  })
}
