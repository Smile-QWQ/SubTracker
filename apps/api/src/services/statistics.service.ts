import dayjs from 'dayjs'
import { prisma } from '../db'
import { ensureExchangeRates, getBaseCurrency } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { monthKey } from '../utils/date'
import { getAppSettings } from './settings.service'

function monthlyFactor(unit: string, count: number) {
  switch (unit) {
    case 'day':
      return 30 / count
    case 'week':
      return 4.345 / count
    case 'month':
      return 1 / count
    case 'quarter':
      return 1 / (count * 3)
    case 'year':
      return 1 / (count * 12)
    default:
      return 1
  }
}

export async function getOverviewStatistics() {
  const [subscriptions, paymentRecords, appSettings] = await Promise.all([
    prisma.subscription.findMany({
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      where: { status: { in: ['active', 'paused', 'expired'] } }
    }),
    prisma.paymentRecord.findMany({
      orderBy: { paidAt: 'asc' }
    }),
    getAppSettings()
  ])

  const today = dayjs()
  const next7 = today.add(7, 'day')
  const next30 = today.add(30, 'day')

  const rates = await ensureExchangeRates()
  const baseCurrency = await getBaseCurrency()

  let monthlyEstimatedBase = 0
  let yearlyEstimatedBase = 0

  const tagMap = new Map<string, number>()
  const tagBudgetMap = new Map<string, { name: string; spent: number }>()

  for (const subscription of subscriptions.filter((item) => item.status === 'active')) {
    const baseAmount = convertAmount(
      subscription.amount,
      subscription.currency,
      baseCurrency,
      rates.baseCurrency,
      rates.rates
    )
    const monthly = baseAmount * monthlyFactor(subscription.billingIntervalUnit, subscription.billingIntervalCount)
    monthlyEstimatedBase += monthly
    yearlyEstimatedBase += monthly * 12

    const tags =
      subscription.tags
        .map((item) => item.tag)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')) ??
      []

    if (!tags.length) {
      tagMap.set('未打标签', (tagMap.get('未打标签') ?? 0) + monthly)
      continue
    }

    const splitMonthly = monthly / tags.length
    for (const tag of tags) {
      tagMap.set(tag.name, (tagMap.get(tag.name) ?? 0) + splitMonthly)

      const current = tagBudgetMap.get(tag.id) ?? {
        name: tag.name,
        spent: 0
      }
      current.spent += splitMonthly
      tagBudgetMap.set(tag.id, current)
    }
  }

  const monthlyTrendMap = new Map<string, number>()
  for (const payment of paymentRecords) {
    const key = monthKey(payment.paidAt)
    monthlyTrendMap.set(key, (monthlyTrendMap.get(key) ?? 0) + payment.convertedAmount)
  }

  const currencyDistributionMap = new Map<string, number>()
  for (const subscription of subscriptions.filter((item) => item.status === 'active')) {
    currencyDistributionMap.set(
      subscription.currency,
      (currencyDistributionMap.get(subscription.currency) ?? 0) + subscription.amount
    )
  }

  const upcoming = subscriptions.filter(
    (subscription) =>
      dayjs(subscription.nextRenewalDate).isAfter(today) && dayjs(subscription.nextRenewalDate).isBefore(next30)
  )

  return {
    activeSubscriptions: subscriptions.filter((item) => item.status === 'active').length,
    upcoming7Days: subscriptions.filter(
      (item) => dayjs(item.nextRenewalDate).isAfter(today) && dayjs(item.nextRenewalDate).isBefore(next7)
    ).length,
    upcoming30Days: upcoming.length,
    monthlyEstimatedBase: Number(monthlyEstimatedBase.toFixed(2)),
    yearlyEstimatedBase: Number(yearlyEstimatedBase.toFixed(2)),
    monthlyBudgetBase: appSettings.monthlyBudgetBase,
    yearlyBudgetBase: appSettings.yearlyBudgetBase,
    monthlyBudgetUsageRatio:
      appSettings.monthlyBudgetBase && appSettings.monthlyBudgetBase > 0
        ? Number((monthlyEstimatedBase / appSettings.monthlyBudgetBase).toFixed(4))
        : null,
    yearlyBudgetUsageRatio:
      appSettings.yearlyBudgetBase && appSettings.yearlyBudgetBase > 0
        ? Number((yearlyEstimatedBase / appSettings.yearlyBudgetBase).toFixed(4))
        : null,
    tagSpend: Array.from(tagMap.entries()).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2))
    })),
    monthlyTrend: Array.from(monthlyTrendMap.entries()).map(([month, amount]) => ({
      month,
      amount: Number(amount.toFixed(2))
    })),
    currencyDistribution: Array.from(currencyDistributionMap.entries()).map(([currency, amount]) => ({
      currency,
      amount: Number(amount.toFixed(2))
    })),
    tagBudgetUsage: appSettings.enableTagBudgets
      ? Array.from(tagBudgetMap.entries()).flatMap(([tagId, item]) => {
          const budget = appSettings.tagBudgets[tagId]
          if (budget === undefined) return []

          return [
            {
              tagId,
              name: item.name,
              budget: Number(budget.toFixed(2)),
              spent: Number(item.spent.toFixed(2)),
              ratio: budget > 0 ? Number((item.spent / budget).toFixed(4)) : 0
            }
          ]
        })
      : [],
    upcomingRenewals: upcoming
      .sort((a, b) => a.nextRenewalDate.getTime() - b.nextRenewalDate.getTime())
      .map((item) => ({
        id: item.id,
        name: item.name,
        nextRenewalDate: item.nextRenewalDate.toISOString(),
        amount: item.amount,
        currency: item.currency,
        convertedAmount: convertAmount(
          item.amount,
          item.currency,
          baseCurrency,
          rates.baseCurrency,
          rates.rates
        ),
        status: item.status
      }))
  }
}
