import { ensureExchangeRates } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { getAppSettings } from './settings.service'
import { withWorkerLiteCache } from './worker-lite-cache.service'
import { getLiteOverviewStatisticsSnapshot } from './worker-lite-statistics.repository'
import { listStatisticsSubscriptionsLite } from './worker-lite-repository.service'
import { formatDateInTimezone, startOfDayDateInTimezone, toTimezonedDayjs } from '../utils/timezone'
import { isWorkerRuntime } from '../runtime'

interface BudgetEntry {
  spent: number
  budget: number | null
  ratio: number | null
  overBudget: number
  status: 'normal' | 'warning' | 'over'
}

interface TopSubscriptionEntry {
  id: string
  name: string
  amount: number
  currency: string
  monthlyAmountBase: number
  baseCurrency: string
}

const STATISTICS_CACHE_TTL_SECONDS = 30

async function fetchStatisticsSubscriptions(filters?: Parameters<typeof listStatisticsSubscriptionsLite>[0]) {
  return listStatisticsSubscriptionsLite(filters)
}

function resolveStatisticsStateKey(prefix: string, cacheVersion?: number) {
  return cacheVersion !== undefined ? `${prefix}:v${cacheVersion}` : `${prefix}:default`
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

function resolveBudgetStatus(ratio: number | null) {
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

async function buildStatisticsBaseState() {
  const [subscriptions, appSettings] = await Promise.all([fetchStatisticsSubscriptions(), getAppSettings()])

  const timezone = appSettings.timezone
  const today = toTimezonedDayjs(new Date(), timezone)
  const next7 = today.add(7, 'day')
  const next30 = today.add(30, 'day')

  const baseCurrency = appSettings.baseCurrency
  const rates = await ensureExchangeRates(baseCurrency)

  let monthlyEstimatedBase = 0
  let yearlyEstimatedBase = 0

  const statusDistributionMap = new Map<string, number>()
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

    currencyDistributionMap.set(
      subscription.currency,
      (currencyDistributionMap.get(subscription.currency) ?? 0) + subscription.amount
    )

  }

  const upcomingRenewals = projectedSubscriptions
    .filter((subscription) => {
      const renewalDate = toTimezonedDayjs(subscription.nextRenewalDate, timezone)
      return (renewalDate.isAfter(today) || renewalDate.isSame(today, 'day')) && renewalDate.isBefore(next30)
    })
    .sort((a, b) => a.nextRenewalDate.getTime() - b.nextRenewalDate.getTime())
    .map((item) => ({
      id: item.id,
      name: item.name,
      nextRenewalDate: formatDateInTimezone(item.nextRenewalDate, timezone),
      amount: item.amount,
      currency: item.currency,
      convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
      status: item.status
    }))

  const budgetSummary = {
    monthly: buildBudgetEntry(monthlyEstimatedBase, appSettings.monthlyBudgetBase),
    yearly: buildBudgetEntry(yearlyEstimatedBase, appSettings.yearlyBudgetBase)
  }

  return {
    appSettings,
    baseCurrency,
    timezone,
    rates,
    monthlyEstimatedBase: Number(monthlyEstimatedBase.toFixed(2)),
    yearlyEstimatedBase: Number(yearlyEstimatedBase.toFixed(2)),
    upcomingRenewals,
    budgetSummary,
    statusDistribution: (['active', 'paused', 'cancelled', 'expired'] as const).map((status) => ({
      status,
      count: statusDistributionMap.get(status) ?? 0
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
      const renewalDate = toTimezonedDayjs(item.nextRenewalDate, timezone)
      return (renewalDate.isAfter(today) || renewalDate.isSame(today, 'day')) && renewalDate.isBefore(next7)
    }).length,
    upcoming30DaysCount: upcomingRenewals.length
  }
}

async function getStatisticsBaseState(cacheVersion?: number) {
  return withWorkerLiteCache(
    'statistics',
    resolveStatisticsStateKey('state:base', cacheVersion),
    buildStatisticsBaseState,
    STATISTICS_CACHE_TTL_SECONDS
  )
}

async function buildWorkerLiteOverviewStatistics() {
  const appSettings = await getAppSettings()
  const timezone = appSettings.timezone
  const today = toTimezonedDayjs(new Date(), timezone)
  const queryStart = startOfDayDateInTimezone(new Date(), timezone)
  const upcoming7End = today.add(7, 'day').toDate()
  const upcoming30End = today.add(30, 'day').toDate()
  const snapshot = await getLiteOverviewStatisticsSnapshot({
    queryStart,
    upcoming7End,
    upcoming30End,
    upcomingQueryEnd: upcoming30End
  })
  const baseCurrency = appSettings.baseCurrency
  const rates = await ensureExchangeRates(baseCurrency)

  let monthlyEstimatedBase = 0
  let yearlyEstimatedBase = 0
  const currencyDistributionMap = new Map<string, number>()
  const topSubscriptionsByMonthlyCost: TopSubscriptionEntry[] = []

  for (const subscription of snapshot.activeSubscriptions) {
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

    currencyDistributionMap.set(
      subscription.currency,
      (currencyDistributionMap.get(subscription.currency) ?? 0) + subscription.amount
    )
  }

  const budgetSummary = {
    monthly: buildBudgetEntry(monthlyEstimatedBase, appSettings.monthlyBudgetBase),
    yearly: buildBudgetEntry(yearlyEstimatedBase, appSettings.yearlyBudgetBase)
  }

  return {
    activeSubscriptions: snapshot.activeSubscriptions.length,
    upcoming7Days: snapshot.upcomingCounts.upcoming7DaysCount,
    upcoming30Days: snapshot.upcomingCounts.upcoming30DaysCount,
    monthlyEstimatedBase: Number(monthlyEstimatedBase.toFixed(2)),
    yearlyEstimatedBase: Number(yearlyEstimatedBase.toFixed(2)),
    monthlyBudgetBase: appSettings.monthlyBudgetBase,
    yearlyBudgetBase: appSettings.yearlyBudgetBase,
    monthlyBudgetUsageRatio: budgetSummary.monthly.ratio,
    yearlyBudgetUsageRatio: budgetSummary.yearly.ratio,
    budgetSummary,
    statusDistribution: snapshot.statusCounts,
    currencyDistribution: Array.from(currencyDistributionMap.entries()).map(([currency, amount]) => ({
      currency,
      amount: Number(amount.toFixed(2))
    })),
    topSubscriptionsByMonthlyCost: topSubscriptionsByMonthlyCost
      .sort((a, b) => b.monthlyAmountBase - a.monthlyAmountBase || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 10),
    upcomingRenewals: snapshot.upcomingRenewals.map((item) => ({
      id: item.id,
      name: item.name,
      nextRenewalDate: formatDateInTimezone(item.nextRenewalDate, timezone),
      amount: item.amount,
      currency: item.currency,
      convertedAmount: convertAmount(item.amount, item.currency, baseCurrency, rates.baseCurrency, rates.rates),
      status: item.status
    }))
  }
}

async function getWorkerLiteOverviewStatistics(cacheVersion?: number) {
  return withWorkerLiteCache(
    'statistics',
    resolveStatisticsStateKey('state:overview-lite', cacheVersion),
    buildWorkerLiteOverviewStatistics,
    STATISTICS_CACHE_TTL_SECONDS
  )
}

export async function getOverviewStatistics(cacheVersion?: number) {
  if (isWorkerRuntime()) {
    return getWorkerLiteOverviewStatistics(cacheVersion)
  }

  const state = await getStatisticsBaseState(cacheVersion)

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
    statusDistribution: state.statusDistribution,
    currencyDistribution: state.currencyDistribution,
    topSubscriptionsByMonthlyCost: state.topSubscriptionsByMonthlyCost,
    upcomingRenewals: state.upcomingRenewals
  }
}
