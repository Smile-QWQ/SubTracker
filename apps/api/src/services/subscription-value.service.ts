import { addInterval } from '../utils/date'
import { convertAmount } from '../utils/money'
import { endOfDayDateInTimezone, startOfDayDateInTimezone, toTimezonedDayjs } from '../utils/timezone'

type PaymentRecordLike = {
  amount: number
  currency: string
  periodStart: Date
  periodEnd: Date
  paidAt?: Date
}

type SubscriptionLike = {
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: 'day' | 'week' | 'month' | 'quarter' | 'year'
  startDate: Date
  nextRenewalDate: Date
}

export type SubscriptionRemainingValueSummary = {
  currentCycleStartDate: string
  currentCycleEndDate: string
  remainingDays: number
  remainingRatio: number
  remainingValue: number
  remainingValueCurrency: string
}

function selectAlignedPaymentRecord(subscription: SubscriptionLike, paymentRecords: PaymentRecordLike[]) {
  const targetTime = subscription.nextRenewalDate.getTime()

  return [...paymentRecords]
    .filter((record) => record.periodEnd.getTime() === targetTime)
    .sort((a, b) => {
      const paidAtDelta = (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0)
      if (paidAtDelta !== 0) return paidAtDelta
      return b.periodStart.getTime() - a.periodStart.getTime()
    })[0]
}

function resolveFallbackCycleStart(subscription: SubscriptionLike, timezone: string) {
  const derivedStart = addInterval(
    subscription.nextRenewalDate,
    -subscription.billingIntervalCount,
    subscription.billingIntervalUnit,
    timezone
  )

  const startAt = Math.max(derivedStart.getTime(), subscription.startDate.getTime())
  return new Date(startAt)
}

function resolveCycleBoundaries(subscription: SubscriptionLike, paymentRecords: PaymentRecordLike[], timezone: string) {
  const alignedPayment = selectAlignedPaymentRecord(subscription, paymentRecords)
  const currentCycleEnd = subscription.nextRenewalDate

  if (alignedPayment) {
    return {
      currentCycleStart: alignedPayment.periodStart,
      currentCycleEnd,
      cycleAmount: alignedPayment.amount,
      cycleCurrency: alignedPayment.currency
    }
  }

  return {
    currentCycleStart: resolveFallbackCycleStart(subscription, timezone),
    currentCycleEnd,
    cycleAmount: subscription.amount,
    cycleCurrency: subscription.currency
  }
}

export function calculateSubscriptionRemainingValue(
  subscription: SubscriptionLike,
  paymentRecords: PaymentRecordLike[],
  now: Date,
  timezone: string,
  options?: {
    baseCurrency?: string
    exchangeRatesBaseCurrency?: string
    exchangeRates?: Record<string, number>
  }
): SubscriptionRemainingValueSummary {
  const { currentCycleStart, currentCycleEnd, cycleAmount, cycleCurrency } = resolveCycleBoundaries(
    subscription,
    paymentRecords,
    timezone
  )

  const cycleStartDay = startOfDayDateInTimezone(currentCycleStart, timezone)
  const nominalCycleEnd = addInterval(currentCycleStart, subscription.billingIntervalCount, subscription.billingIntervalUnit, timezone)
  const packageEndDay = endOfDayDateInTimezone(nominalCycleEnd, timezone)
  const actualCycleEndDay = endOfDayDateInTimezone(currentCycleEnd, timezone)
  const totalCycleDays = Math.max(
    toTimezonedDayjs(packageEndDay, timezone).diff(toTimezonedDayjs(cycleStartDay, timezone), 'day') + 1,
    1
  )

  let remainingDays = 0
  const localNow = toTimezonedDayjs(now, timezone)
  const remainingDaysAnchor = localNow.add(1, 'day')

  if (!localNow.isAfter(toTimezonedDayjs(actualCycleEndDay, timezone))) {
    remainingDays = Math.max(
      toTimezonedDayjs(actualCycleEndDay, timezone).diff(
        toTimezonedDayjs(startOfDayDateInTimezone(remainingDaysAnchor.toDate(), timezone), timezone),
        'day'
      ) + 1,
      0
    )
  }

  const normalizedRemainingDays = Math.max(remainingDays, 0)
  const remainingRatio = Number((normalizedRemainingDays / totalCycleDays).toFixed(4))
  const remainingValueCurrency = options?.baseCurrency?.toUpperCase() || cycleCurrency
  const rawRemainingValue = Number(Math.max(cycleAmount * remainingRatio, 0).toFixed(2))
  const remainingValue =
    options?.baseCurrency && options.exchangeRatesBaseCurrency && options.exchangeRates
      ? convertAmount(
          rawRemainingValue,
          cycleCurrency,
          options.baseCurrency,
          options.exchangeRatesBaseCurrency,
          options.exchangeRates
        )
      : rawRemainingValue

  return {
    currentCycleStartDate: toTimezonedDayjs(currentCycleStart, timezone).format('YYYY-MM-DD'),
    currentCycleEndDate: toTimezonedDayjs(currentCycleEnd, timezone).format('YYYY-MM-DD'),
    remainingDays: normalizedRemainingDays,
    remainingRatio,
    remainingValue,
    remainingValueCurrency
  }
}
