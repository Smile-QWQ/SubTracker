import { prisma } from '../db'
import { getRuntimeD1Database, isWorkerRuntime } from '../runtime'

type LiteOverviewActiveSubscriptionRow = {
  id: string
  name: string
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: 'day' | 'week' | 'month' | 'quarter' | 'year'
  autoRenew: boolean
}

type LiteOverviewUpcomingRenewalRow = {
  id: string
  name: string
  amount: number
  currency: string
  status: 'active' | 'paused' | 'cancelled' | 'expired'
  nextRenewalDate: Date
}

type LiteOverviewStatusCountRow = {
  status: 'active' | 'paused' | 'cancelled' | 'expired'
  count: number
}

type LiteOverviewSnapshot = {
  activeSubscriptions: LiteOverviewActiveSubscriptionRow[]
  statusCounts: LiteOverviewStatusCountRow[]
  upcomingCounts: {
    upcoming7DaysCount: number
    upcoming30DaysCount: number
  }
  upcomingRenewals: LiteOverviewUpcomingRenewalRow[]
}

type LiteOverviewQueryOptions = {
  queryStart: Date
  upcoming7End: Date
  upcoming30End: Date
  upcomingQueryEnd: Date
  upcomingRenewalLimit?: number
}

type D1LiteOverviewActiveSubscriptionRow = {
  id: string
  name: string
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: string
  autoRenew: number | boolean
}

type D1LiteOverviewStatusCountRow = {
  status: string
  count: number | string
}

type D1LiteOverviewUpcomingCountRow = {
  upcoming7DaysCount: number | string | null
  upcoming30DaysCount: number | string | null
}

type D1LiteOverviewUpcomingRenewalRow = {
  id: string
  name: string
  amount: number
  currency: string
  status: string
  nextRenewalDate: string
}

export const LITE_OVERVIEW_UPCOMING_LIMIT = 100

function getD1() {
  if (!isWorkerRuntime()) return null
  return getRuntimeD1Database()
}

async function d1All<T>(sql: string, params: unknown[] = []) {
  const db = getD1()
  if (!db) {
    throw new Error('D1 unavailable')
  }
  const statement = db.prepare(sql)
  const executed = params.length ? statement.bind(...params) : statement
  return ((await executed.all<T>()).results ?? []) as T[]
}

async function d1First<T>(sql: string, params: unknown[] = []) {
  const db = getD1()
  if (!db) {
    throw new Error('D1 unavailable')
  }
  const statement = db.prepare(sql)
  const executed = params.length ? statement.bind(...params) : statement
  return (await executed.first<T>()) as T | null
}

function parseBoolean(value: number | boolean | string | null | undefined) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
  return false
}

function normalizeStatus(value: string) {
  return value as LiteOverviewStatusCountRow['status']
}

function normalizeBillingIntervalUnit(value: string) {
  return value as LiteOverviewActiveSubscriptionRow['billingIntervalUnit']
}

async function getLiteOverviewSnapshotFromPrisma({
  queryStart,
  upcoming7End,
  upcoming30End,
  upcomingQueryEnd,
  upcomingRenewalLimit = LITE_OVERVIEW_UPCOMING_LIMIT
}: LiteOverviewQueryOptions): Promise<LiteOverviewSnapshot> {
  const [statusRows, activeSubscriptions, upcoming7DaysCount, upcoming30DaysCount, upcomingRenewals] = await Promise.all([
    prisma.subscription.findMany({
      select: {
        status: true
      },
      orderBy: [{ createdAt: 'asc' }]
    }),
    prisma.subscription.findMany({
      where: {
        status: 'active'
      },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        billingIntervalCount: true,
        billingIntervalUnit: true,
        autoRenew: true
      },
      orderBy: [{ createdAt: 'asc' }]
    }),
    prisma.subscription.count({
      where: {
        status: { in: ['active', 'expired'] },
        nextRenewalDate: {
          gte: queryStart,
          lt: upcoming7End
        }
      }
    }),
    prisma.subscription.count({
      where: {
        status: { in: ['active', 'expired'] },
        nextRenewalDate: {
          gte: queryStart,
          lt: upcoming30End
        }
      }
    }),
    prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'expired'] },
        nextRenewalDate: {
          gte: queryStart,
          lt: upcomingQueryEnd
        }
      },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        status: true,
        nextRenewalDate: true
      },
      orderBy: [{ nextRenewalDate: 'asc' }, { createdAt: 'asc' }],
      take: upcomingRenewalLimit
    })
  ])

  const statusCountMap = new Map<string, number>()
  for (const row of statusRows) {
    statusCountMap.set(row.status, (statusCountMap.get(row.status) ?? 0) + 1)
  }

  return {
    activeSubscriptions: activeSubscriptions.map((row) => ({
      id: row.id,
      name: row.name,
      amount: row.amount,
      currency: row.currency,
      billingIntervalCount: row.billingIntervalCount,
      billingIntervalUnit: row.billingIntervalUnit,
      autoRenew: row.autoRenew
    })),
    statusCounts: (['active', 'paused', 'cancelled', 'expired'] as const).map((status) => ({
      status,
      count: statusCountMap.get(status) ?? 0
    })),
    upcomingCounts: {
      upcoming7DaysCount,
      upcoming30DaysCount
    },
    upcomingRenewals: upcomingRenewals.map((row) => ({
      id: row.id,
      name: row.name,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      nextRenewalDate: row.nextRenewalDate
    }))
  }
}

async function getLiteOverviewSnapshotFromD1({
  queryStart,
  upcoming7End,
  upcoming30End,
  upcomingQueryEnd,
  upcomingRenewalLimit = LITE_OVERVIEW_UPCOMING_LIMIT
}: LiteOverviewQueryOptions): Promise<LiteOverviewSnapshot> {
  const [statusRows, activeSubscriptions, upcomingCountsRow, upcomingRenewals] = await Promise.all([
    d1All<D1LiteOverviewStatusCountRow>(
      `SELECT s.status AS status, COUNT(*) AS count
       FROM Subscription s
       GROUP BY s.status`
    ),
    d1All<D1LiteOverviewActiveSubscriptionRow>(
      `SELECT
         s.id,
         s.name,
         s.amount,
         s.currency,
         s.billingIntervalCount,
         s.billingIntervalUnit,
         s.autoRenew
       FROM Subscription s
       WHERE s.status = 'active'
       ORDER BY s.createdAt ASC`
    ),
    d1First<D1LiteOverviewUpcomingCountRow>(
      `SELECT
         SUM(CASE WHEN s.nextRenewalDate >= ? AND s.nextRenewalDate < ? THEN 1 ELSE 0 END) AS upcoming7DaysCount,
         SUM(CASE WHEN s.nextRenewalDate >= ? AND s.nextRenewalDate < ? THEN 1 ELSE 0 END) AS upcoming30DaysCount
       FROM Subscription s
       WHERE s.status IN ('active', 'expired')
         AND s.nextRenewalDate >= ?
         AND s.nextRenewalDate < ?`,
      [
        queryStart.toISOString(),
        upcoming7End.toISOString(),
        queryStart.toISOString(),
        upcoming30End.toISOString(),
        queryStart.toISOString(),
        upcomingQueryEnd.toISOString()
      ]
    ),
    d1All<D1LiteOverviewUpcomingRenewalRow>(
      `SELECT
         s.id,
         s.name,
         s.amount,
         s.currency,
         s.status,
         s.nextRenewalDate
       FROM Subscription s
       WHERE s.status IN ('active', 'expired')
         AND s.nextRenewalDate >= ?
         AND s.nextRenewalDate < ?
       ORDER BY s.nextRenewalDate ASC, s.createdAt ASC
       LIMIT ${Math.max(1, Math.floor(upcomingRenewalLimit))}`,
      [queryStart.toISOString(), upcomingQueryEnd.toISOString()]
    )
  ])

  const statusCountMap = new Map(statusRows.map((row) => [row.status, Number(row.count)]))

  return {
    activeSubscriptions: activeSubscriptions.map((row) => ({
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      currency: row.currency,
      billingIntervalCount: Number(row.billingIntervalCount),
      billingIntervalUnit: normalizeBillingIntervalUnit(row.billingIntervalUnit),
      autoRenew: parseBoolean(row.autoRenew)
    })),
    statusCounts: (['active', 'paused', 'cancelled', 'expired'] as const).map((status) => ({
      status,
      count: statusCountMap.get(status) ?? 0
    })),
    upcomingCounts: {
      upcoming7DaysCount: Number(upcomingCountsRow?.upcoming7DaysCount ?? 0),
      upcoming30DaysCount: Number(upcomingCountsRow?.upcoming30DaysCount ?? 0)
    },
    upcomingRenewals: upcomingRenewals.map((row) => ({
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      currency: row.currency,
      status: normalizeStatus(row.status),
      nextRenewalDate: new Date(row.nextRenewalDate)
    }))
  }
}

export async function getLiteOverviewStatisticsSnapshot(options: LiteOverviewQueryOptions) {
  if (!getD1()) {
    return getLiteOverviewSnapshotFromPrisma(options)
  }

  return getLiteOverviewSnapshotFromD1(options)
}
