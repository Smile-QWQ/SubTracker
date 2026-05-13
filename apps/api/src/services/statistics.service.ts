import { ensureExchangeRates } from './exchange-rate.service'
import { convertAmount } from '../utils/money'
import { getAppSettings } from './settings.service'
import { projectRenewalEvents } from './projected-renewal.service'
import { withWorkerLiteCache } from './worker-lite-cache.service'
import { getLiteOverviewStatisticsSnapshot } from './worker-lite-statistics.repository'
import { listStatisticsSubscriptionsLite, listTagsLite } from './worker-lite-repository.service'
import { formatDateInTimezone, startOfDayDateInTimezone, startOfMonthDateInTimezone, toTimezonedDayjs } from '../utils/timezone'
import { isWorkerRuntime } from '../runtime'

type BudgetStatus = 'normal' | 'warning' | 'over'

type StatisticsSubscription = Awaited<ReturnType<typeof fetchStatisticsSubscriptions>>[number]
type StatisticsBaseState = Awaited<ReturnType<typeof buildStatisticsBaseState>>

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

const PROJECTED_MONTH_COUNT = 12
const UPCOMING_DAY_COUNT = 90
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

function getSortedSubscriptionTags(subscription: StatisticsSubscription) {
  return (
    subscription.tags
      .map((item) => item.tag)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')) ?? []
  )
}

function buildTagBudgetUsage(
  appSettings: Awaited<ReturnType<typeof getAppSettings>>,
  tagBudgetMap: Map<string, { name: string; spent: number }>,
  tagLookup: Map<string, string>
) {
  if (!appSettings.enableTagBudgets) {
    return [] as TagBudgetUsageEntry[]
  }

  return Object.entries(appSettings.tagBudgets)
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
}

function buildTagBudgetSummary(tagBudgetUsage: TagBudgetUsageEntry[]) {
  return {
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
}

function buildLiteTagBudgetSummary(appSettings: Awaited<ReturnType<typeof getAppSettings>>) {
  return {
    configuredCount: Object.keys(appSettings.tagBudgets).length,
    warningCount: 0,
    overBudgetCount: 0,
    topTags: [] as Array<{
      tagId: string
      name: string
      budget: number
      spent: number
      ratio: number
      remaining: number
      overBudget: number
      status: BudgetStatus
    }>
  }
}

function buildProjectedStatisticsSeries(
  subscriptions: StatisticsSubscription[],
  baseCurrency: string,
  rates: Awaited<ReturnType<typeof ensureExchangeRates>>,
  timezone: string
) {
  const startMonth = toTimezonedDayjs(startOfMonthDateInTimezone(new Date(), timezone), timezone)
  const endMonth = startMonth.add(PROJECTED_MONTH_COUNT - 1, 'month').endOf('month')
  const startDay = toTimezonedDayjs(startOfDayDateInTimezone(new Date(), timezone), timezone)
  const endDay = startDay.add(UPCOMING_DAY_COUNT - 1, 'day').endOf('day')
  const startDayKey = startDay.format('YYYY-MM-DD')
  const endDayKey = endDay.format('YYYY-MM-DD')
  const monthlyTrendMap = new Map<string, number>()
  const upcomingMap = new Map<string, { count: number; amount: number }>()

  for (let index = 0; index < PROJECTED_MONTH_COUNT; index += 1) {
    monthlyTrendMap.set(startMonth.add(index, 'month').format('YYYY-MM'), 0)
  }

  for (let index = 0; index < UPCOMING_DAY_COUNT; index += 1) {
    upcomingMap.set(startDay.add(index, 'day').format('YYYY-MM-DD'), { count: 0, amount: 0 })
  }

  const projectedEvents = projectRenewalEvents(subscriptions, {
    start: startMonth.toDate(),
    end: endMonth.toDate(),
    statuses: ['active', 'expired'],
    timezone,
    sortResult: false
  })

  for (const event of projectedEvents) {
    const convertedAmount = convertAmount(event.amount, event.currency, baseCurrency, rates.baseCurrency, rates.rates)
    const monthKey = event.dateKey.slice(0, 7)
    monthlyTrendMap.set(monthKey, (monthlyTrendMap.get(monthKey) ?? 0) + convertedAmount)

    if (event.dateKey >= startDayKey && event.dateKey <= endDayKey) {
      const current = upcomingMap.get(event.dateKey) ?? { count: 0, amount: 0 }
      current.count += 1
      current.amount += convertedAmount
      upcomingMap.set(event.dateKey, current)
    }
  }

  return {
    monthlyTrend: Array.from(monthlyTrendMap.entries()).map(([month, amount]) => ({
      month,
      amount: Number(amount.toFixed(2))
    })),
    upcomingByDay: Array.from(upcomingMap.entries()).map(([date, value]) => ({
      date,
      count: value.count,
      amount: Number(value.amount.toFixed(2))
    }))
  }
}

async function buildStatisticsBaseState() {
  const [subscriptions, appSettings] = await Promise.all([
    fetchStatisticsSubscriptions(),
    getAppSettings()
  ])
  const tags = appSettings.enableTagBudgets ? await listTagsLite() : []

  const timezone = appSettings.timezone
  const today = toTimezonedDayjs(new Date(), timezone)
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

    const tags = getSortedSubscriptionTags(subscription)

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

  const tagLookup = new Map(tags.map((tag) => [tag.id, tag.name]))

  const tagBudgetUsage = buildTagBudgetUsage(appSettings, tagBudgetMap, tagLookup)

  const budgetSummary = {
    monthly: buildBudgetEntry(monthlyEstimatedBase, appSettings.monthlyBudgetBase),
    yearly: buildBudgetEntry(yearlyEstimatedBase, appSettings.yearlyBudgetBase)
  }

  const tagBudgetSummary = buildTagBudgetSummary(tagBudgetUsage)

  return {
    appSettings,
    baseCurrency,
    timezone,
    rates,
    projectedSubscriptions,
    monthlyEstimatedBase: Number(monthlyEstimatedBase.toFixed(2)),
    yearlyEstimatedBase: Number(yearlyEstimatedBase.toFixed(2)),
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

async function buildBudgetStatisticsState() {
  const [activeSubscriptions, appSettings] = await Promise.all([
    fetchStatisticsSubscriptions({ statuses: ['active'] }),
    getAppSettings()
  ])
  const tags = appSettings.enableTagBudgets ? await listTagsLite() : []
  const baseCurrency = appSettings.baseCurrency
  const rates = await ensureExchangeRates(baseCurrency)

  let monthlyEstimatedBase = 0
  let yearlyEstimatedBase = 0
  const tagBudgetMap = new Map<string, { name: string; spent: number }>()

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

    if (!appSettings.enableTagBudgets) {
      continue
    }

    const subscriptionTags = getSortedSubscriptionTags(subscription)
    if (!subscriptionTags.length) {
      continue
    }

    const splitMonthly = monthly / subscriptionTags.length
    for (const tag of subscriptionTags) {
      const current = tagBudgetMap.get(tag.id) ?? {
        name: tag.name,
        spent: 0
      }
      current.spent += splitMonthly
      tagBudgetMap.set(tag.id, current)
    }
  }

  const tagLookup = new Map(tags.map((tag) => [tag.id, tag.name]))
  const tagBudgetUsage = buildTagBudgetUsage(appSettings, tagBudgetMap, tagLookup)

  return {
    appSettings,
    budgetSummary: {
      monthly: buildBudgetEntry(monthlyEstimatedBase, appSettings.monthlyBudgetBase),
      yearly: buildBudgetEntry(yearlyEstimatedBase, appSettings.yearlyBudgetBase)
    },
    tagBudgetSummary: buildTagBudgetSummary(tagBudgetUsage),
    tagBudgetUsage
  }
}

async function buildStatisticsProjectedSeries(state: StatisticsBaseState) {
  return buildProjectedStatisticsSeries(state.projectedSubscriptions, state.baseCurrency, state.rates, state.timezone)
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
  const renewalModeMap = new Map<'auto' | 'manual', { count: number; amount: number }>([
    ['auto', { count: 0, amount: 0 }],
    ['manual', { count: 0, amount: 0 }]
  ])
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

    const modeKey = subscription.autoRenew ? 'auto' : 'manual'
    const currentMode = renewalModeMap.get(modeKey) ?? { count: 0, amount: 0 }
    currentMode.count += 1
    currentMode.amount += monthly
    renewalModeMap.set(modeKey, currentMode)

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
    tagBudgetSummary: appSettings.enableTagBudgets ? buildLiteTagBudgetSummary(appSettings) : null,
    tagSpend: [],
    monthlyTrend: [],
    monthlyTrendMeta: {
      mode: 'projected' as const,
      months: PROJECTED_MONTH_COUNT
    },
    statusDistribution: snapshot.statusCounts,
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
    upcomingByDay: [],
    currencyDistribution: Array.from(currencyDistributionMap.entries()).map(([currency, amount]) => ({
      currency,
      amount: Number(amount.toFixed(2))
    })),
    topSubscriptionsByMonthlyCost: topSubscriptionsByMonthlyCost
      .sort((a, b) => b.monthlyAmountBase - a.monthlyAmountBase || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 10),
    tagBudgetUsage: [],
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
  const projectedSeries = await withWorkerLiteCache(
    'statistics',
    resolveStatisticsStateKey('state:projected-series', cacheVersion),
    () => buildStatisticsProjectedSeries(state),
    STATISTICS_CACHE_TTL_SECONDS
  )

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
    monthlyTrend: projectedSeries.monthlyTrend,
    monthlyTrendMeta: {
      mode: 'projected' as const,
      months: PROJECTED_MONTH_COUNT
    },
    statusDistribution: state.statusDistribution,
    renewalModeDistribution: state.renewalModeDistribution,
    upcomingByDay: projectedSeries.upcomingByDay,
    currencyDistribution: state.currencyDistribution,
    topSubscriptionsByMonthlyCost: state.topSubscriptionsByMonthlyCost,
    tagBudgetUsage: state.appSettings.enableTagBudgets ? state.tagBudgetUsage : [],
    upcomingRenewals: state.upcomingRenewals
  }
}

export async function getBudgetStatistics(cacheVersion?: number) {
  const state = await withWorkerLiteCache(
    'statistics',
    resolveStatisticsStateKey('state:budget', cacheVersion),
    buildBudgetStatisticsState,
    STATISTICS_CACHE_TTL_SECONDS
  )

  return {
    enabledTagBudgets: state.appSettings.enableTagBudgets,
    budgetSummary: state.budgetSummary,
    tagBudgetSummary: state.appSettings.enableTagBudgets ? state.tagBudgetSummary : null,
    tagBudgetUsage: state.appSettings.enableTagBudgets ? state.tagBudgetUsage : []
  }
}
