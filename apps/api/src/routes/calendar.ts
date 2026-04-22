import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendOk, sendError } from '../http'
import { withWorkerLiteCache } from '../services/worker-lite-cache.service'
import { ensureExchangeRates, getBaseCurrency } from '../services/exchange-rate.service'
import { projectRenewalEvents } from '../services/projected-renewal.service'
import { listCalendarSubscriptionsLite } from '../services/worker-lite-repository.service'
import { convertAmount } from '../utils/money'

export async function calendarRoutes(app: FastifyInstance) {
  app.get('/calendar/events', async (request, reply) => {
    const querySchema = z.object({
      start: z.string().date().optional(),
      end: z.string().date().optional()
    })

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid query', parsed.error.flatten())
    }

    const start = parsed.data.start ? dayjs(parsed.data.start).startOf('day').toDate() : dayjs().startOf('month').toDate()
    const end = parsed.data.end ? dayjs(parsed.data.end).endOf('day').toDate() : dayjs().endOf('month').toDate()

    const cacheKey = JSON.stringify({
      start: start.toISOString(),
      end: end.toISOString()
    })

    const events = await withWorkerLiteCache(
      'calendar',
      cacheKey,
      async () => {
        const subscriptions = await listCalendarSubscriptionsLite({
          statuses: ['active', 'expired'],
          nextRenewalDateLte: end
        })

        const baseCurrency = await getBaseCurrency()
        const rates = await ensureExchangeRates(baseCurrency)
        const projectedEvents = projectRenewalEvents(subscriptions, {
          start,
          end,
          statuses: ['active', 'expired']
        })

        return projectedEvents.map((item) => ({
          id: item.id,
          title: item.title,
          date: item.date.toISOString(),
          currency: item.currency,
          amount: item.amount,
          convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
          status: item.status
        }))
      },
      30
    )

    return sendOk(reply, events)
  })
}
