import { prisma } from '../db'
import { addInterval } from '../utils/date'
import { ensureExchangeRates, getBaseCurrency } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { getAppTimezone } from './settings.service'
import { endOfDayDateInTimezone, startOfDayDateInTimezone, toTimezonedDayjs } from '../utils/timezone'

export async function renewSubscription(
  subscriptionId: string,
  paidAt?: Date,
  paidAmount?: number,
  paidCurrency?: string,
  timezone?: string
) {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } })
  if (!subscription) {
    throw new Error('Subscription not found')
  }

  const appTimezone = timezone ?? (await getAppTimezone())
  const amount = paidAmount ?? subscription.amount
  const currency = (paidCurrency ?? subscription.currency).toUpperCase()
  const baseCurrency = await getBaseCurrency()
  const rates = await ensureExchangeRates(baseCurrency)
  const convertedAmount = convertAmount(amount, currency, baseCurrency, rates.baseCurrency, rates.rates)
  const exchangeRate = amount === 0 ? 0 : Number((convertedAmount / amount).toFixed(8))

  const periodStart = subscription.nextRenewalDate
  const periodEnd = addInterval(
    subscription.nextRenewalDate,
    subscription.billingIntervalCount,
    subscription.billingIntervalUnit,
    appTimezone
  )

  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentRecord.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        currency,
        baseCurrency,
        convertedAmount,
        exchangeRate,
        paidAt: paidAt ?? new Date(),
        periodStart,
        periodEnd
      }
    })

    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        nextRenewalDate: periodEnd,
        status: 'active'
      }
    })

    return {
      payment,
      subscription: updated
    }
  })
}

export async function autoRenewDueSubscriptions(today = new Date()) {
  const timezone = await getAppTimezone()
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      autoRenew: true,
      status: { in: ['active', 'expired'] },
      nextRenewalDate: {
        lte: endOfDayDateInTimezone(today, timezone)
      }
    },
    orderBy: { nextRenewalDate: 'asc' }
  })

  let renewedCount = 0

  for (const subscription of dueSubscriptions) {
    let currentNextRenewalDate = subscription.nextRenewalDate
    let guard = 0

    const todayEnd = toTimezonedDayjs(today, timezone).endOf('day')

    while (!toTimezonedDayjs(currentNextRenewalDate, timezone).isAfter(todayEnd) && guard < 24) {
      const result = await renewSubscription(subscription.id, undefined, undefined, undefined, timezone)
      renewedCount += 1
      currentNextRenewalDate = result.subscription.nextRenewalDate
      guard += 1
    }
  }

  return renewedCount
}

export async function reconcileExpiredSubscriptions(today = new Date()) {
  const timezone = await getAppTimezone()
  const cutoff = startOfDayDateInTimezone(today, timezone)
  const rows = await prisma.subscription.findMany({
    where: {
      status: 'active',
      nextRenewalDate: {
        lt: cutoff
      }
    },
    select: {
      id: true
    }
  })

  for (const row of rows) {
    await prisma.subscription.update({
      where: { id: row.id },
      data: {
        status: 'expired'
      }
    })
  }

  return rows.length
}
