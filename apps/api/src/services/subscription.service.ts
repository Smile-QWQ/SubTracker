import { prisma } from '../db'
import { addInterval } from '../utils/date'
import { ensureExchangeRates, getBaseCurrency } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { getAppTimezone } from './settings.service'
import { endOfDayDateInTimezone, startOfDayDateInTimezone, toTimezonedDayjs } from '../utils/timezone'

const AUTO_RENEW_BATCH_LIMIT = 100
const AUTO_RENEW_MAX_CYCLES_PER_SUBSCRIPTION = 24

type RenewableSubscription = Awaited<ReturnType<typeof prisma.subscription.findUnique>>

type RenewExecutionContext = {
  timezone: string
  baseCurrency: string
  rates: Awaited<ReturnType<typeof ensureExchangeRates>>
}

async function renewSubscriptionFromSnapshot(
  subscription: NonNullable<RenewableSubscription>,
  context: RenewExecutionContext,
  paidAt?: Date,
  paidAmount?: number,
  paidCurrency?: string
) {
  const amount = paidAmount ?? subscription.amount
  const currency = (paidCurrency ?? subscription.currency).toUpperCase()
  const convertedAmount = convertAmount(amount, currency, context.baseCurrency, context.rates.baseCurrency, context.rates.rates)
  const exchangeRate = amount === 0 ? 0 : Number((convertedAmount / amount).toFixed(8))

  const periodStart = subscription.nextRenewalDate
  const periodEnd = addInterval(
    subscription.nextRenewalDate,
    subscription.billingIntervalCount,
    subscription.billingIntervalUnit,
    context.timezone
  )

  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentRecord.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        currency,
        baseCurrency: context.baseCurrency,
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

  const baseCurrency = await getBaseCurrency()
  const context: RenewExecutionContext = {
    timezone: timezone ?? (await getAppTimezone()),
    baseCurrency,
    rates: await ensureExchangeRates(baseCurrency)
  }

  return renewSubscriptionFromSnapshot(subscription, context, paidAt, paidAmount, paidCurrency)
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
    orderBy: { nextRenewalDate: 'asc' },
    take: AUTO_RENEW_BATCH_LIMIT
  })
  const baseCurrency = await getBaseCurrency()
  const context: RenewExecutionContext = {
    timezone,
    baseCurrency,
    rates: await ensureExchangeRates(baseCurrency)
  }

  let renewedCount = 0
  const todayEnd = toTimezonedDayjs(today, timezone).endOf('day')

  for (const subscription of dueSubscriptions) {
    let currentSubscription = subscription
    let guard = 0

    while (
      !toTimezonedDayjs(currentSubscription.nextRenewalDate, timezone).isAfter(todayEnd) &&
      guard < AUTO_RENEW_MAX_CYCLES_PER_SUBSCRIPTION
    ) {
      const result = await renewSubscriptionFromSnapshot(currentSubscription, context)
      renewedCount += 1
      currentSubscription = {
        ...currentSubscription,
        nextRenewalDate: result.subscription.nextRenewalDate,
        status: result.subscription.status
      }
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
