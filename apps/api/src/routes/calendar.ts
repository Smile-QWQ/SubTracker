import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendOk, sendError } from '../http'
import { ensureExchangeRates, getBaseCurrency } from '../services/exchange-rate.service'
import { projectRenewalEvents } from '../services/projected-renewal.service'
import { getAppTimezone } from '../services/settings.service'
import { convertAmount } from '../utils/money'
import {
  endOfDayDateInTimezone,
  endOfMonthDateInTimezone,
  formatDateInTimezone,
  startOfDayDateInTimezone,
  startOfMonthDateInTimezone
} from '../utils/timezone'

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
    const end = parsed.data.end
      ? endOfDayDateInTimezone(parsed.data.end, timezone)
      : endOfMonthDateInTimezone(new Date(), timezone)

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'expired'] },
        nextRenewalDate: {
          lte: end
        }
      },
      orderBy: { nextRenewalDate: 'asc' },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        billingIntervalCount: true,
        billingIntervalUnit: true,
        nextRenewalDate: true,
        status: true
      }
    })

    const baseCurrency = await getBaseCurrency()
    const rates = await ensureExchangeRates(baseCurrency)
    const projectedEvents = projectRenewalEvents(subscriptions, {
      start,
      end,
      statuses: ['active', 'expired'],
      timezone
    })

    const events = projectedEvents.map((item) => ({
      id: item.id,
      title: item.title,
      date: formatDateInTimezone(item.date, timezone),
      currency: item.currency,
      amount: item.amount,
      convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
      status: item.status
    }))

    return sendOk(reply, events)
  })
}
