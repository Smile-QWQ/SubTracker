import { prisma } from '../db'
import { addInterval } from '../utils/date'
import { ensureExchangeRates, getBaseCurrency } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import dayjs from 'dayjs'

export async function renewSubscription(subscriptionId: string, paidAt?: Date, paidAmount?: number, paidCurrency?: string) {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } })
  if (!subscription) {
    throw new Error('Subscription not found')
  }

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
    subscription.billingIntervalUnit
  )

  const [payment, updated] = await prisma.$transaction([
    prisma.paymentRecord.create({
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
    }),
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        nextRenewalDate: periodEnd,
        status: 'active'
      }
    })
  ])

  return {
    payment,
    subscription: updated
  }
}

export async function autoRenewDueSubscriptions(today = new Date()) {
  const windowStart = dayjs(today).startOf('hour').toDate()
  const windowEnd = dayjs(today).endOf('hour').toDate()
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      autoRenew: true,
      status: { in: ['active', 'expired'] },
      nextRenewalDate: {
        gte: windowStart,
        lte: windowEnd
      }
    },
    orderBy: { nextRenewalDate: 'asc' }
  })

  let renewedCount = 0

  for (const subscription of dueSubscriptions) {
    let currentNextRenewalDate = subscription.nextRenewalDate
    let guard = 0

    while (!dayjs(currentNextRenewalDate).isAfter(dayjs(today).endOf('day')) && guard < 24) {
      const result = await renewSubscription(subscription.id)
      renewedCount += 1
      currentNextRenewalDate = result.subscription.nextRenewalDate
      guard += 1
    }
  }

  return renewedCount
}

export async function reconcileExpiredSubscriptions(today = new Date()) {
  const cutoff = dayjs(today).startOf('day').toDate()
  const result = await prisma.subscription.updateMany({
    where: {
      status: 'active',
      nextRenewalDate: {
        lt: cutoff
      }
    },
    data: {
      status: 'expired'
    }
  })

  return result.count
}
