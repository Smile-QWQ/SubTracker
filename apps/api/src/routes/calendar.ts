import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendOk, sendError } from '../http'
import { ensureExchangeRates, getBaseCurrency } from '../services/exchange-rate.service'
import { projectRenewalEvents } from '../services/projected-renewal.service'
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

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'expired'] },
        nextRenewalDate: {
          lte: end
        }
      },
      orderBy: { nextRenewalDate: 'asc' }
    })

    const baseCurrency = await getBaseCurrency()
    const rates = await ensureExchangeRates(baseCurrency)
    const projectedEvents = projectRenewalEvents(subscriptions, {
      start,
      end,
      statuses: ['active', 'expired']
    })

    const events = projectedEvents.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date.toISOString(),
      currency: item.currency,
      amount: item.amount,
      convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
      status: item.status
    }))

    return sendOk(reply, events)
  })
}
