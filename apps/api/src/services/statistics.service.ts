import dayjs from 'dayjs'
import { prisma } from '../db'
import { ensureExchangeRates, getBaseCurrency } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { getAppSettings } from './settings.service'
import { projectRenewalEvents } from './projected-renewal.service'

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

function buildProjectedMonthlyTrend(
  subscriptions: Awaited<ReturnType<typeof prisma.subscription.findMany>>,
  baseCurrency: string,
  rates: Awaited<ReturnType<typeof ensureExchangeRates>>
) {
  const startMonth = dayjs().startOf('month')
  const endMonth = startMonth.add(11, 'month').endOf('month')
  const monthlyTrendMap = new Map<string, number>()

  for (let index = 0; index < 12; index += 1) {
    monthlyTrendMap.set(startMonth.add(index, 'month').format('YYYY-MM'), 0)
  }

  const projectedEvents = projectRenewalEvents(subscriptions, {
    start: startMonth.toDate(),
    end: endMonth.toDate(),
    statuses: ['active', 'expired']
  })

  for (const event of projectedEvents) {
    const convertedAmount = convertAmount(event.amount, event.currency, baseCurrency, rates.baseCurrency, rates.rates)
    const key = dayjs(event.date).format('YYYY-MM')
    monthlyTrendMap.set(key, (monthlyTrendMap.get(key) ?? 0) + convertedAmount)
  }

  return Array.from(monthlyTrendMap.entries()).map(([month, amount]) => ({
    month,
    amount: Number(amount.toFixed(2))
  }))
}

function buildUpcomingByDay(
  subscriptions: Awaited<ReturnType<typeof prisma.subscription.findMany>>,
  baseCurrency: string,
  rates: Awaited<ReturnType<typeof ensureExchangeRates>>
) {
  const startDay = dayjs().startOf('day')
  const endDay = startDay.add(89, 'day').endOf('day')
  const upcomingMap = new Map<string, { count: number; amount: number }>()

  for (let index = 0; index < 90; index += 1) {
    upcomingMap.set(startDay.add(index, 'day').format('YYYY-MM-DD'), { count: 0, amount: 0 })
  }

  const projectedEvents = projectRenewalEvents(subscriptions, {
    start: startDay.toDate(),
    end: endDay.toDate(),
    statuses: ['active', 'expired']
  })

  for (const event of projectedEvents) {
    const convertedAmount = convertAmount(event.amount, event.currency, baseCurrency, rates.baseCurrency, rates.rates)
    const key = dayjs(event.date).format('YYYY-MM-DD')
    const current = upcomingMap.get(key) ?? { count: 0, amount: 0 }
    current.count += 1
    current.amount += convertedAmount
    upcomingMap.set(key, current)
  }

  return Array.from(upcomingMap.entries()).map(([date, value]) => ({
    date,
    count: value.count,
    amount: Number(value.amount.toFixed(2))
  }))
}

export async function getOverviewStatistics() {
  const [subscriptions, appSettings] = await Promise.all([
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
  const statusDistributionMap = new Map<string, number>()
  const renewalModeMap = new Map<'auto' | 'manual', { count: number; amount: number }>([
    ['auto', { count: 0, amount: 0 }],
    ['manual', { count: 0, amount: 0 }]
  ])

  for (const subscription of subscriptions) {
    statusDistributionMap.set(subscription.status, (statusDistributionMap.get(subscription.status) ?? 0) + 1)
  }

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
    const modeKey = subscription.autoRenew ? 'auto' : 'manual'
    const currentMode = renewalModeMap.get(modeKey) ?? { count: 0, amount: 0 }
    currentMode.count += 1
    currentMode.amount += monthly
    renewalModeMap.set(modeKey, currentMode)

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

  const monthlyTrend = buildProjectedMonthlyTrend(subscriptions, baseCurrency, rates)
  const upcomingByDay = buildUpcomingByDay(subscriptions, baseCurrency, rates)

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
    monthlyTrend,
    monthlyTrendMeta: {
      mode: 'projected' as const,
      months: 12
    },
    statusDistribution: (['active', 'paused', 'cancelled', 'expired'] as const).map((status) => ({
      status,
      count: statusDistributionMap.get(status) ?? 0
    })),
    renewalModeDistribution: [
      {
        autoRenew: true,
        count: renewalModeMap.get('auto')?.count ?? 0,
        amount: Number((renewalModeMap.get('auto')?.amount ?? 0).toFixed(2))
      },
      {
        autoRenew: false,
        count: renewalModeMap.get('manual')?.count ?? 0,
        amount: Number((renewalModeMap.get('manual')?.amount ?? 0).toFixed(2))
      }
    ],
    upcomingByDay,
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
