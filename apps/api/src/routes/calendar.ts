import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendOk, sendError } from '../http'
import { getCacheVersion } from '../services/cache-version.service'
import { ensureExchangeRates, getBaseCurrency } from '../services/exchange-rate.service'
import { getAppTimezone } from '../services/settings.service'
import { projectRenewalEvents } from '../services/projected-renewal.service'
import { withWorkerTieredCache } from '../services/worker-tiered-cache.service'
import { listCalendarSubscriptionsLite } from '../services/worker-lite-repository.service'
import { convertAmount } from '../utils/money'
import {
  endOfDayDateInTimezone,
  endOfMonthDateInTimezone,
  startOfDayDateInTimezone,
  startOfMonthDateInTimezone
} from '../utils/timezone'

const CALENDAR_CACHE_TTL_SECONDS = 10 * 60

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

    const timezone = await getAppTimezone()
    const start = parsed.data.start
      ? startOfDayDateInTimezone(parsed.data.start, timezone)
      : startOfMonthDateInTimezone(new Date(), timezone)
    const end = parsed.data.end ? endOfDayDateInTimezone(parsed.data.end, timezone) : endOfMonthDateInTimezone(new Date(), timezone)
    const version = await getCacheVersion('calendar')

    const cacheKey = JSON.stringify({
      start: start.toISOString(),
      end: end.toISOString(),
      timezone,
      version
    })

    const events = await withWorkerTieredCache(
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
          statuses: ['active', 'expired'],
          timezone
        })

        return projectedEvents.map((item) => ({
          id: item.id,
          title: item.title,
          date: item.dateKey,
          currency: item.currency,
          amount: item.amount,
          convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
          status: item.status
        }))
      },
      CALENDAR_CACHE_TTL_SECONDS
    )

    return sendOk(reply, events)
  })
}
