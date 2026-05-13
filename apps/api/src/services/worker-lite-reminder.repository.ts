import { prisma } from '../db'
import { getRuntimeD1Database, isWorkerRuntime } from '../runtime'

type ReminderScanSubscriptionRow = {
  id: string
  name: string
  nextRenewalDate: Date
  notifyDaysBefore: number
  advanceReminderRules: string | null
  overdueReminderRules: string | null
  amount: number
  currency: string
  status: 'active' | 'expired'
  websiteUrl: string | null
  notes: string
}

function normalizePrismaReminderSubscriptionRow(
  row: Omit<ReminderScanSubscriptionRow, 'status'> & { status: string }
): ReminderScanSubscriptionRow {
  return {
    ...row,
    status: row.status as 'active' | 'expired',
    websiteUrl: row.websiteUrl ?? null,
    notes: row.notes ?? ''
  }
}

type D1ReminderScanSubscriptionRow = {
  id: string
  name: string
  nextRenewalDate: string
  notifyDaysBefore: number | string
  advanceReminderRules: string | null
  overdueReminderRules: string | null
  amount: number | string
  currency: string
  status: string
  websiteUrl: string | null
  notes: string | null
}

type ReminderScanWindowInput = {
  queryStart: Date
  queryEnd: Date
}

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

function normalizeReminderSubscriptionRow(row: D1ReminderScanSubscriptionRow): ReminderScanSubscriptionRow {
  return {
    id: row.id,
    name: row.name,
    nextRenewalDate: new Date(row.nextRenewalDate),
    notifyDaysBefore: Number(row.notifyDaysBefore),
    advanceReminderRules: row.advanceReminderRules ?? null,
    overdueReminderRules: row.overdueReminderRules ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as 'active' | 'expired',
    websiteUrl: row.websiteUrl ?? null,
    notes: row.notes ?? ''
  }
}

const REMINDER_SCAN_SELECT = `SELECT
  s.id,
  s.name,
  s.nextRenewalDate,
  s.notifyDaysBefore,
  s.advanceReminderRules,
  s.overdueReminderRules,
  s.amount,
  s.currency,
  s.status,
  s.websiteUrl,
  s.notes
 FROM Subscription s`

export async function listReminderScanSubscriptionsDefaultWindow({
  queryStart,
  queryEnd
}: ReminderScanWindowInput): Promise<ReminderScanSubscriptionRow[]> {
  if (!getD1()) {
    const rows = await prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'expired'] },
        webhookEnabled: true,
        nextRenewalDate: {
          gte: queryStart,
          lte: queryEnd
        }
      },
      select: {
        id: true,
        name: true,
        nextRenewalDate: true,
        notifyDaysBefore: true,
        advanceReminderRules: true,
        overdueReminderRules: true,
        amount: true,
        currency: true,
        status: true,
        websiteUrl: true,
        notes: true
      },
      orderBy: [{ createdAt: 'asc' }]
    })

    return rows.map(normalizePrismaReminderSubscriptionRow)
  }

  const rows = await d1All<D1ReminderScanSubscriptionRow>(
    `${REMINDER_SCAN_SELECT}
     WHERE s.status IN ('active', 'expired')
       AND s.webhookEnabled = 1
       AND s.nextRenewalDate >= ?
       AND s.nextRenewalDate <= ?
     ORDER BY s.createdAt ASC`,
    [queryStart.toISOString(), queryEnd.toISOString()]
  )

  return rows.map(normalizeReminderSubscriptionRow)
}

export async function listReminderScanSubscriptionsCustomWindow({
  queryStart,
  queryEnd
}: ReminderScanWindowInput): Promise<ReminderScanSubscriptionRow[]> {
  if (!getD1()) {
    const rows = await prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'expired'] },
        webhookEnabled: true,
        nextRenewalDate: {
          gte: queryStart,
          lte: queryEnd
        },
        OR: [
          {
            advanceReminderRules: {
              not: ''
            }
          },
          {
            overdueReminderRules: {
              not: ''
            }
          }
        ]
      },
      select: {
        id: true,
        name: true,
        nextRenewalDate: true,
        notifyDaysBefore: true,
        advanceReminderRules: true,
        overdueReminderRules: true,
        amount: true,
        currency: true,
        status: true,
        websiteUrl: true,
        notes: true
      },
      orderBy: [{ createdAt: 'asc' }]
    })

    return rows
      .filter(
        (row) =>
          Boolean(row.advanceReminderRules?.trim()) ||
          Boolean(row.overdueReminderRules?.trim())
      )
      .map(normalizePrismaReminderSubscriptionRow)
  }

  const rows = await d1All<D1ReminderScanSubscriptionRow>(
    `${REMINDER_SCAN_SELECT}
     WHERE s.status IN ('active', 'expired')
       AND s.webhookEnabled = 1
       AND s.nextRenewalDate >= ?
       AND s.nextRenewalDate <= ?
       AND (
         (s.advanceReminderRules IS NOT NULL AND TRIM(s.advanceReminderRules) != '')
         OR
         (s.overdueReminderRules IS NOT NULL AND TRIM(s.overdueReminderRules) != '')
       )
     ORDER BY s.createdAt ASC`,
    [queryStart.toISOString(), queryEnd.toISOString()]
  )

  return rows.map(normalizeReminderSubscriptionRow)
}
