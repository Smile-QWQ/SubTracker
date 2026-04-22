import dayjs from 'dayjs'
import { ensureExchangeRates } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { getAppSettings } from './settings.service'
import { projectRenewalEvents } from './projected-renewal.service'
import { listStatisticsSubscriptionsLite, listTagsLite } from './worker-lite-repository.service'

type BudgetStatus = 'normal' | 'warning' | 'over'

type StatisticsSubscription = Awaited<ReturnType<typeof fetchStatisticsSubscriptions>>[number]

interface BudgetEntry {
  spent: number
  budget: number | null
  ratio: number | null
  overBudget: number
  status: BudgetStatus
}

interface TagBudgetUsageEntry {
  tagId: string
  name: string
  budget: number
  spent: number
  ratio: number
  remaining: number
  overBudget: number
  status: BudgetStatus
}

interface TopSubscriptionEntry {
  id: string
  name: string
  amount: number
  currency: string
  monthlyAmountBase: number
  baseCurrency: string
}

async function fetchStatisticsSubscriptions() {
  return listStatisticsSubscriptionsLite()
}

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

function resolveBudgetStatus(ratio: number | null): BudgetStatus {
  if (ratio === null) return 'normal'
  if (ratio > 1) return 'over'
  if (ratio >= 0.8) return 'warning'
  return 'normal'
}

function buildBudgetEntry(spent: number, budget: number | null | undefined): BudgetEntry {
  const normalizedBudget = budget ?? null
  const ratio = normalizedBudget && normalizedBudget > 0 ? Number((spent / normalizedBudget).toFixed(4)) : null
  const overBudget =
    normalizedBudget && normalizedBudget > 0 ? Number(Math.max(spent - normalizedBudget, 0).toFixed(2)) : 0

  return {
    spent: Number(spent.toFixed(2)),
    budget: normalizedBudget === null ? null : Number(normalizedBudget.toFixed(2)),
    ratio,
    overBudget,
    status: resolveBudgetStatus(ratio)
  }
}

function buildProjectedMonthlyTrend(
  subscriptions: StatisticsSubscription[],
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
  subscriptions: StatisticsSubscription[],
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

async function buildStatisticsState() {
  const [subscriptions, appSettings] = await Promise.all([
    fetchStatisticsSubscriptions(),
    getAppSettings()
  ])
  const tags = appSettings.enableTagBudgets ? await listTagsLite() : []

  const today = dayjs()
  const next7 = today.add(7, 'day')
  const next30 = today.add(30, 'day')

  const baseCurrency = appSettings.baseCurrency
  const rates = await ensureExchangeRates(baseCurrency)

  let monthlyEstimatedBase = 0
  let yearlyEstimatedBase = 0

  const tagSpendMap = new Map<string, number>()
  const tagBudgetMap = new Map<string, { name: string; spent: number }>()
  const statusDistributionMap = new Map<string, number>()
  const renewalModeMap = new Map<'auto' | 'manual', { count: number; amount: number }>([
    ['auto', { count: 0, amount: 0 }],
    ['manual', { count: 0, amount: 0 }]
  ])
  const currencyDistributionMap = new Map<string, number>()
  const topSubscriptionsByMonthlyCost: TopSubscriptionEntry[] = []

  for (const subscription of subscriptions) {
    statusDistributionMap.set(subscription.status, (statusDistributionMap.get(subscription.status) ?? 0) + 1)
  }

  const activeSubscriptions = subscriptions.filter((item) => item.status === 'active')
  const projectedSubscriptions = subscriptions.filter((item) => ['active', 'expired'].includes(item.status))

  for (const subscription of activeSubscriptions) {
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
    topSubscriptionsByMonthlyCost.push({
      id: subscription.id,
      name: subscription.name,
      amount: subscription.amount,
      currency: subscription.currency,
      monthlyAmountBase: Number(monthly.toFixed(2)),
      baseCurrency
    })

    const modeKey = subscription.autoRenew ? 'auto' : 'manual'
    const currentMode = renewalModeMap.get(modeKey) ?? { count: 0, amount: 0 }
    currentMode.count += 1
    currentMode.amount += monthly
    renewalModeMap.set(modeKey, currentMode)

    currencyDistributionMap.set(
      subscription.currency,
      (currencyDistributionMap.get(subscription.currency) ?? 0) + subscription.amount
    )

    const tags =
      subscription.tags
        .map((item) => item.tag)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')) ?? []

    if (!tags.length) {
      tagSpendMap.set('未打标签', (tagSpendMap.get('未打标签') ?? 0) + monthly)
      continue
    }

    const splitMonthly = monthly / tags.length
    for (const tag of tags) {
      tagSpendMap.set(tag.name, (tagSpendMap.get(tag.name) ?? 0) + splitMonthly)

      if (appSettings.enableTagBudgets) {
        const current = tagBudgetMap.get(tag.id) ?? {
          name: tag.name,
          spent: 0
        }
        current.spent += splitMonthly
        tagBudgetMap.set(tag.id, current)
      }
    }
  }

  const monthlyTrend = buildProjectedMonthlyTrend(projectedSubscriptions, baseCurrency, rates)
  const upcomingByDay = buildUpcomingByDay(projectedSubscriptions, baseCurrency, rates)

  const upcomingRenewals = projectedSubscriptions
    .filter((subscription) => {
      const renewalDate = dayjs(subscription.nextRenewalDate)
      return (renewalDate.isAfter(today) || renewalDate.isSame(today, 'day')) && renewalDate.isBefore(next30)
    })
    .sort((a, b) => a.nextRenewalDate.getTime() - b.nextRenewalDate.getTime())
    .map((item) => ({
      id: item.id,
      name: item.name,
      nextRenewalDate: item.nextRenewalDate.toISOString(),
      amount: item.amount,
      currency: item.currency,
      convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
      status: item.status
    }))

  const tagLookup = new Map(tags.map((tag) => [tag.id, tag.name]))

  const tagBudgetUsage = appSettings.enableTagBudgets
    ? Object.entries(appSettings.tagBudgets)
        .flatMap<TagBudgetUsageEntry>(([tagId, budget]) => {
          const item = tagBudgetMap.get(tagId)
          const name = item?.name ?? tagLookup.get(tagId)
          if (!name) return []

          const spent = Number((item?.spent ?? 0).toFixed(2))
          const ratio = budget > 0 ? Number((spent / budget).toFixed(4)) : 0
          const remaining = Number(Math.max(budget - spent, 0).toFixed(2))
          const overBudget = Number(Math.max(spent - budget, 0).toFixed(2))

          return [
            {
              tagId,
              name,
              budget: Number(budget.toFixed(2)),
              spent,
              ratio,
              remaining,
              overBudget,
              status: resolveBudgetStatus(ratio)
            }
          ]
        })
        .sort((a, b) => b.ratio - a.ratio || b.spent - a.spent || a.name.localeCompare(b.name, 'zh-CN'))
    : []

  const budgetSummary = {
    monthly: buildBudgetEntry(monthlyEstimatedBase, appSettings.monthlyBudgetBase),
    yearly: buildBudgetEntry(yearlyEstimatedBase, appSettings.yearlyBudgetBase)
  }

  const tagBudgetSummary = {
    configuredCount: tagBudgetUsage.length,
    warningCount: tagBudgetUsage.filter((item) => item.status === 'warning').length,
    overBudgetCount: tagBudgetUsage.filter((item) => item.status === 'over').length,
    topTags: tagBudgetUsage.slice(0, 3).map((item) => ({
      tagId: item.tagId,
      name: item.name,
      budget: item.budget,
      spent: item.spent,
      ratio: item.ratio,
      remaining: item.remaining,
      overBudget: item.overBudget,
      status: item.status
    }))
  }

  return {
    appSettings,
    baseCurrency,
    monthlyEstimatedBase: Number(monthlyEstimatedBase.toFixed(2)),
    yearlyEstimatedBase: Number(yearlyEstimatedBase.toFixed(2)),
    monthlyTrend,
    upcomingByDay,
    upcomingRenewals,
    budgetSummary,
    tagBudgetUsage,
    tagBudgetSummary,
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
    tagSpend: Array.from(tagSpendMap.entries()).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2))
    })),
    currencyDistribution: Array.from(currencyDistributionMap.entries()).map(([currency, amount]) => ({
      currency,
      amount: Number(amount.toFixed(2))
    })),
    topSubscriptionsByMonthlyCost: topSubscriptionsByMonthlyCost
      .sort((a, b) => b.monthlyAmountBase - a.monthlyAmountBase || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 10),
    activeSubscriptionCount: activeSubscriptions.length,
    upcoming7DaysCount: projectedSubscriptions.filter((item) => {
      const renewalDate = dayjs(item.nextRenewalDate)
      return (renewalDate.isAfter(today) || renewalDate.isSame(today, 'day')) && renewalDate.isBefore(next7)
    }).length,
    upcoming30DaysCount: upcomingRenewals.length
  }
}

export async function getOverviewStatistics() {
  const state = await buildStatisticsState()

  return {
    activeSubscriptions: state.activeSubscriptionCount,
    upcoming7Days: state.upcoming7DaysCount,
    upcoming30Days: state.upcoming30DaysCount,
    monthlyEstimatedBase: state.monthlyEstimatedBase,
    yearlyEstimatedBase: state.yearlyEstimatedBase,
    monthlyBudgetBase: state.appSettings.monthlyBudgetBase,
    yearlyBudgetBase: state.appSettings.yearlyBudgetBase,
    monthlyBudgetUsageRatio: state.budgetSummary.monthly.ratio,
    yearlyBudgetUsageRatio: state.budgetSummary.yearly.ratio,
    budgetSummary: state.budgetSummary,
    tagBudgetSummary: state.appSettings.enableTagBudgets ? state.tagBudgetSummary : null,
    tagSpend: state.tagSpend,
    monthlyTrend: state.monthlyTrend,
    monthlyTrendMeta: {
      mode: 'projected' as const,
      months: 12
    },
    statusDistribution: state.statusDistribution,
    renewalModeDistribution: state.renewalModeDistribution,
    upcomingByDay: state.upcomingByDay,
    currencyDistribution: state.currencyDistribution,
    topSubscriptionsByMonthlyCost: state.topSubscriptionsByMonthlyCost,
    tagBudgetUsage: state.appSettings.enableTagBudgets ? state.tagBudgetUsage : [],
    upcomingRenewals: state.upcomingRenewals
  }
}

export async function getBudgetStatistics() {
  const state = await buildStatisticsState()

  return {
    enabledTagBudgets: state.appSettings.enableTagBudgets,
    budgetSummary: state.budgetSummary,
    tagBudgetSummary: state.appSettings.enableTagBudgets ? state.tagBudgetSummary : null,
    tagBudgetUsage: state.appSettings.enableTagBudgets ? state.tagBudgetUsage : []
  }
}
