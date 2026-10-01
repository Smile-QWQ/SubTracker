import type { Prisma } from '@prisma/client'
import type { PaymentInput, PaymentQuery, PaymentHistorySummary, PaymentCurrencyTotal, UpdatePaymentInput } from '@subtracker/shared'
import { prisma } from '../db'
import { getAppTimezone } from './settings.service'
import { ensureExchangeRates } from './exchange-rate.service'
import { roundMoney } from '../utils/money'
import { parseDateInTimezone, toTimezonedDayjs, monthKeyInTimezone, formatDateInTimezone } from '../utils/timezone'

export class PaymentHistoryError extends Error {
  constructor(readonly key: string, readonly status = 422) { super(key) }
}

type StoredMoney = { amount: number; currency: string; baseCurrency: string; convertedAmount: number; exchangeRate: number; rateSource: string; paidAt?: Date; periodStart?: Date; periodEnd?: Date }
export async function preparePaymentData(input: PaymentInput, timezone: string, previous?: StoredMoney) {
  let baseCurrency: string
  let exchangeRate: number
  let rateSource: string
  if (input.conversion.mode === 'preserve') {
    if (!previous || input.currency !== previous.currency) throw new PaymentHistoryError('paymentHistory.errors.conversionRequired')
    baseCurrency = previous.baseCurrency
    exchangeRate = previous.exchangeRate
    rateSource = previous.rateSource
    if (input.amount !== previous.amount && input.amount > 0 && exchangeRate <= 0) {
      throw new PaymentHistoryError('paymentHistory.errors.conversionRequired')
    }
  } else {
    baseCurrency = input.conversion.baseCurrency
    rateSource = input.conversion.mode
    if (input.currency === baseCurrency) {
      if (input.conversion.mode === 'manual' && input.conversion.exchangeRate !== 1) throw new PaymentHistoryError('paymentHistory.errors.sameCurrencyRate')
      exchangeRate = 1
    } else if (input.conversion.mode === 'manual') {
      exchangeRate = input.conversion.exchangeRate
    } else {
      const snapshot = await ensureExchangeRates(baseCurrency)
      const rates = { ...snapshot.rates, [snapshot.baseCurrency]: 1 }
      exchangeRate = rates[baseCurrency] / rates[input.currency]
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new PaymentHistoryError('paymentHistory.errors.rateUnavailable')
    }
  }
  // A note/date correction must preserve the exact historical converted amount, including old rounding.
  const convertedAmount = input.conversion.mode === 'preserve' && input.amount === previous?.amount
    ? previous.convertedAmount : roundMoney(input.amount * exchangeRate)
  if (!Number.isFinite(convertedAmount) || convertedAmount < 0 || convertedAmount > 1e12) throw new PaymentHistoryError('paymentHistory.errors.amountTooLarge')
  const date = (key: 'paidAt' | 'periodStart' | 'periodEnd') => previous?.[key] && formatDateInTimezone(previous[key], timezone) === input[key]
    ? previous[key] : parseDateInTimezone(input[key], timezone)
  return {
    amount: input.amount, currency: input.currency, baseCurrency, convertedAmount, exchangeRate, rateSource,
    paidAt: date('paidAt'), periodStart: date('periodStart'), periodEnd: date('periodEnd'),
    note: input.note
  }
}

export async function createPayment(subscriptionId: string, input: PaymentInput) {
  const data = await preparePaymentData(input, await getAppTimezone())
  return prisma.$transaction(async tx => {
    if (!await tx.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true } })) {
      throw new PaymentHistoryError('api.errors.subscriptions.notFound', 404)
    }
    // Bookkeeping never advances renewal dates or reactivates a subscription.
    return tx.paymentRecord.create({ data: { ...data, subscriptionId, source: 'manual' } })
  })
}

export async function updatePayment(id: string, input: UpdatePaymentInput) {
  const previous = await prisma.paymentRecord.findUnique({ where: { id } })
  if (!previous) throw new PaymentHistoryError('paymentHistory.errors.notFound', 404)
  const data = await preparePaymentData(input, await getAppTimezone(), previous)
  return prisma.$transaction(async tx => {
    const updated = await tx.paymentRecord.updateMany({
      where: { id, revision: input.revision },
      data: { ...data, ...(input.confirmManual ? { source: 'manual' } : {}), revision: { increment: 1 } }
    })
    if (!updated.count) throw new PaymentHistoryError('paymentHistory.errors.conflict', 409)
    return tx.paymentRecord.findUniqueOrThrow({ where: { id } })
  })
}

export async function deletePayment(id: string, revision: number) {
  const result = await prisma.paymentRecord.deleteMany({ where: { id, revision } })
  if (!result.count) throw new PaymentHistoryError('paymentHistory.errors.conflict', 409)
  return { deleted: true }
}

export function paymentWhere(query: PaymentQuery, timezone: string): Prisma.PaymentRecordWhereInput {
  const paidAt: Prisma.DateTimeFilter = {}
  if (query.from) paidAt.gte = parseDateInTimezone(query.from, timezone)
  if (query.to) {
    // Reparse the next calendar day in the configured zone, including DST transitions.
    const tomorrow = new Date(`${query.to}T00:00:00Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    paidAt.lt = parseDateInTimezone(tomorrow.toISOString().slice(0, 10), timezone)
  }
  return {
    ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
    ...(query.tagId ? { subscription: { tags: { some: { tagId: query.tagId } } } } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.baseCurrency ? { baseCurrency: query.baseCurrency } : {}),
    ...(query.from || query.to ? { paidAt } : {})
  }
}

export async function listPayments(query: PaymentQuery) {
  const where = paymentWhere(query, await getAppTimezone())
  return prisma.$transaction(async tx => {
    const total = await tx.paymentRecord.count({ where })
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)))
    const items = await tx.paymentRecord.findMany({ where, include: { subscription: { select: { id: true, name: true } } },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * query.pageSize, take: query.pageSize })
    return { total, page, pageSize: query.pageSize, items }
  })
}

export async function summarizePayments(query: PaymentQuery, now = new Date()): Promise<PaymentHistorySummary> {
  const timezone = await getAppTimezone()
  const where = paymentWhere(query, timezone)
  const year = toTimezonedDayjs(now, timezone).year()
  const totals = new Map<string, PaymentCurrencyTotal>()
  const thisYear = new Map<string, PaymentCurrencyTotal>()
  const monthly = new Map<string, PaymentHistorySummary['monthly'][number]>()
  const subscriptions = new Map<string, PaymentHistorySummary['subscriptions'][number]>()
  const addTotal = (map: Map<string, PaymentCurrencyTotal>, currency: string, amount: number, source: string) => {
    const total = map.get(currency) ?? { currency, amount: 0, count: 0, manual: 0, automatic: 0, legacy: 0 }
    total.amount += amount
    total.count++
    if (source === 'manual') total.manual++
    else if (source === 'automatic') total.automatic++
    else total.legacy++
    map.set(currency, total)
  }
  // Bounded batches avoid retaining every payment/attachment in memory. One snapshot keeps totals consistent.
  await prisma.$transaction(async tx => {
    let cursor: string | undefined
    while (true) {
      const rows = await tx.paymentRecord.findMany({ where, orderBy: { id: 'asc' }, take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, source: true, paidAt: true, baseCurrency: true, convertedAmount: true, subscriptionId: true,
          subscription: { select: { name: true } } } })
      for (const row of rows) {
        const currency = row.baseCurrency
        // Accumulate integer cents, never add amounts denominated in different currencies.
        const cents = Math.round(row.convertedAmount * 100)
        addTotal(totals, currency, cents, row.source)
        const month = monthKeyInTimezone(row.paidAt, timezone)
        if (Number(month.slice(0, 4)) === year) addTotal(thisYear, currency, cents, row.source)
        const monthKey = `${month}:${currency}`
        const point = monthly.get(monthKey) ?? { month, currency, amount: 0, count: 0 }
        point.amount += cents; point.count++; monthly.set(monthKey, point)
        const key = `${row.subscriptionId}:${currency}`
        const subscription = subscriptions.get(key) ?? { id: row.subscriptionId, name: row.subscription.name, currency, amount: 0, count: 0 }
        subscription.amount += cents; subscription.count++; subscriptions.set(key, subscription)
      }
      if (rows.length < 1000) break
      cursor = rows[rows.length - 1]!.id
    }
  }, { timeout: 30000 })
  const amounts = <T extends { amount: number }>(values: Iterable<T>) => [...values].map(value => ({ ...value, amount: value.amount / 100 }))
  return {
    totals: amounts(totals.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
    thisYear: amounts(thisYear.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
    count: [...totals.values()].reduce((sum, row) => sum + row.count, 0),
    monthly: amounts(monthly.values()).sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency)),
    subscriptions: amounts(subscriptions.values()).sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount)
  }
}
