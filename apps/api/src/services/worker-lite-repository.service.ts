import { prisma } from '../db'
import { getRuntimeD1Database, isWorkerRuntime } from '../runtime'

type TagRow = {
  id: string
  name: string
  color: string
  icon: string
  sortOrder: number
}

type SubscriptionRow = {
  id: string
  name: string
  description: string
  websiteUrl: string | null
  logoUrl: string | null
  logoSource: string | null
  logoFetchedAt: string | null
  status: string
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: string
  autoRenew: number | boolean
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  advanceReminderRules: string | null
  overdueReminderRules: string | null
  webhookEnabled: number | boolean
  notes: string
  createdAt: string
  updatedAt: string
}

type SubscriptionTagJoinRow = {
  subscriptionId: string
  tagId: string
  tagName: string
  tagColor: string
  tagIcon: string
  tagSortOrder: number
}

type SettingRow = {
  key: string
  valueJson: unknown
}

type ExchangeRateSnapshotRow = {
  baseCurrency: string
  ratesJson: unknown
  provider: string
  fetchedAt: string
  isStale: number | boolean
}

type SubscriptionListFilters = {
  q?: string
  status?: string
  tagIds?: string[]
  statuses?: string[]
  nextRenewalDateLte?: Date
  nextRenewalDateGte?: Date
  includeTags?: boolean
}

const D1_IN_CLAUSE_BATCH_SIZE = 50

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

async function d1Run(sql: string, params: unknown[] = []) {
  const db = getD1()
  if (!db) {
    throw new Error('D1 unavailable')
  }
  const statement = db.prepare(sql)
  const executed = params.length ? statement.bind(...params) : statement
  return executed.run()
}

function parseBoolean(value: number | boolean | string | null | undefined) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
  return false
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(value) : null
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function toTag(row: TagRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: Number(row.sortOrder ?? 0)
  }
}

function toSubscription(row: SubscriptionRow, tagRows: SubscriptionTagJoinRow[] = []) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    websiteUrl: row.websiteUrl ?? null,
    logoUrl: row.logoUrl ?? null,
    logoSource: row.logoSource ?? null,
    logoFetchedAt: parseDate(row.logoFetchedAt),
    status: row.status as 'active' | 'paused' | 'cancelled' | 'expired',
    amount: Number(row.amount),
    currency: row.currency,
    billingIntervalCount: Number(row.billingIntervalCount),
    billingIntervalUnit: row.billingIntervalUnit as 'day' | 'week' | 'month' | 'quarter' | 'year',
    autoRenew: parseBoolean(row.autoRenew),
    startDate: new Date(row.startDate),
    nextRenewalDate: new Date(row.nextRenewalDate),
    notifyDaysBefore: Number(row.notifyDaysBefore),
    advanceReminderRules: row.advanceReminderRules ?? null,
    overdueReminderRules: row.overdueReminderRules ?? null,
    webhookEnabled: parseBoolean(row.webhookEnabled),
    notes: row.notes ?? '',
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    tags: tagRows.map((tag) => ({
      tag: {
        id: tag.tagId,
        name: tag.tagName,
        color: tag.tagColor,
        icon: tag.tagIcon,
        sortOrder: Number(tag.tagSortOrder)
      }
    }))
  }
}

function createCuidLike() {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const timestamp = Date.now().toString(36).slice(-8)
  return `c${timestamp}${random}`.slice(0, 25)
}

function decodeJsonText(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value)
  }

  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(value))
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value.toString('utf8')
  }

  return null
}

function parseD1JsonValue<T>(value: unknown): T {
  if (value === null || value === undefined) {
    throw new Error('D1 JSON value is empty')
  }

  if (typeof value === 'object' && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer)) {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return JSON.parse(value.toString('utf8')) as T
    }
    return value as T
  }

  const text = decodeJsonText(value)
  if (text !== null) {
    return JSON.parse(text) as T
  }

  return JSON.parse(String(value)) as T
}

export async function listTagsLite() {
  if (!getD1()) {
    return prisma.tag.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  }

  const rows = await d1All<TagRow>(
    'SELECT id, name, color, icon, sortOrder FROM Tag ORDER BY sortOrder ASC, name ASC'
  )
  return rows.map(toTag)
}

export async function createTagLite(input: { name: string; color: string; icon: string; sortOrder: number }) {
  if (!getD1()) {
    return prisma.tag.create({ data: input })
  }

  const existing = await d1First<{ id: string }>('SELECT id FROM Tag WHERE name = ? LIMIT 1', [input.name])
  if (existing) {
    throw new Error('Tag name already exists')
  }

  const id = createCuidLike()
  await d1Run('INSERT INTO Tag (id, name, color, icon, sortOrder) VALUES (?, ?, ?, ?, ?)', [
    id,
    input.name,
    input.color,
    input.icon,
    input.sortOrder
  ])

  return (await d1First<TagRow>('SELECT id, name, color, icon, sortOrder FROM Tag WHERE id = ? LIMIT 1', [id]).then(
    (row) => (row ? toTag(row) : null)
  ))!
}

export async function updateTagLite(
  id: string,
  payload: Partial<{ name: string; color: string; icon: string; sortOrder: number }>
) {
  if (!getD1()) {
    return prisma.tag.update({ where: { id }, data: payload })
  }

  const existing = await d1First<{ id: string }>('SELECT id FROM Tag WHERE id = ? LIMIT 1', [id])
  if (!existing) {
    throw new Error('Tag not found')
  }

  if (payload.name) {
    const duplicate = await d1First<{ id: string }>('SELECT id FROM Tag WHERE name = ? AND id != ? LIMIT 1', [
      payload.name,
      id
    ])
    if (duplicate) {
      throw new Error('Tag name already exists')
    }
  }

  const sets: string[] = []
  const params: unknown[] = []
  if (payload.name !== undefined) {
    sets.push('name = ?')
    params.push(payload.name)
  }
  if (payload.color !== undefined) {
    sets.push('color = ?')
    params.push(payload.color)
  }
  if (payload.icon !== undefined) {
    sets.push('icon = ?')
    params.push(payload.icon)
  }
  if (payload.sortOrder !== undefined) {
    sets.push('sortOrder = ?')
    params.push(payload.sortOrder)
  }

  if (sets.length > 0) {
    params.push(id)
    await d1Run(`UPDATE Tag SET ${sets.join(', ')} WHERE id = ?`, params)
  }

  return (await d1First<TagRow>('SELECT id, name, color, icon, sortOrder FROM Tag WHERE id = ? LIMIT 1', [id]).then(
    (row) => (row ? toTag(row) : null)
  ))!
}

export async function deleteTagLite(id: string) {
  if (!getD1()) {
    await prisma.$transaction([
      prisma.subscriptionTag.deleteMany({ where: { tagId: id } }),
      prisma.tag.delete({ where: { id } })
    ])
    return
  }

  const existing = await d1First<{ id: string }>('SELECT id FROM Tag WHERE id = ? LIMIT 1', [id])
  if (!existing) {
    throw new Error('Tag not found')
  }

  await d1Run('DELETE FROM SubscriptionTag WHERE tagId = ?', [id])
  await d1Run('DELETE FROM Tag WHERE id = ?', [id])
}

export async function getSettingLite<T>(key: string, fallback: T) {
  if (!getD1()) {
    const row = await prisma.setting.findUnique({ where: { key } })
    return row ? (row.valueJson as T) : fallback
  }

  const row = await d1First<{ valueJson: unknown }>('SELECT valueJson FROM Setting WHERE key = ? LIMIT 1', [key])
  if (!row) return fallback
  return parseD1JsonValue<T>(row.valueJson)
}

export async function setSettingLite<T>(key: string, value: T) {
  if (!getD1()) {
    await prisma.setting.upsert({
      where: { key },
      update: { valueJson: value as object },
      create: { key, valueJson: value as object }
    })
    return
  }

  await d1Run(
    `INSERT INTO Setting (key, valueJson, updatedAt)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET valueJson = excluded.valueJson, updatedAt = CURRENT_TIMESTAMP`,
    [key, JSON.stringify(value)]
  )
}

export async function listSettingsLite() {
  if (!getD1()) {
    const rows = await prisma.setting.findMany({
      select: {
        key: true,
        valueJson: true
      }
    })
    return new Map(rows.map((row) => [row.key, row.valueJson as unknown]))
  }

  const rows = await d1All<SettingRow>('SELECT key, valueJson FROM Setting')
  return new Map(rows.map((row) => [row.key, parseD1JsonValue(row.valueJson)]))
}

function buildSubscriptionWhere(filters: SubscriptionListFilters) {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.q) {
    clauses.push('(s.name LIKE ? OR s.description LIKE ?)')
    const like = `%${filters.q}%`
    params.push(like, like)
  }

  if (filters.status) {
    clauses.push('s.status = ?')
    params.push(filters.status)
  }

  if (filters.statuses?.length) {
    clauses.push(`s.status IN (${filters.statuses.map(() => '?').join(', ')})`)
    params.push(...filters.statuses)
  }

  if (filters.nextRenewalDateGte) {
    clauses.push('s.nextRenewalDate >= ?')
    params.push(filters.nextRenewalDateGte.toISOString())
  }

  if (filters.nextRenewalDateLte) {
    clauses.push('s.nextRenewalDate <= ?')
    params.push(filters.nextRenewalDateLte.toISOString())
  }

  if (filters.tagIds?.length) {
    clauses.push(
      `EXISTS (SELECT 1 FROM SubscriptionTag st WHERE st.subscriptionId = s.id AND st.tagId IN (${filters.tagIds
        .map(() => '?')
        .join(', ')}))`
    )
    params.push(...filters.tagIds)
  }

  return {
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  }
}

export async function listSubscriptionsLite(filters: SubscriptionListFilters = {}) {
  if (!getD1()) {
    const where: Record<string, unknown> = {}
    if (filters.q) {
      where.OR = [{ name: { contains: filters.q } }, { description: { contains: filters.q } }]
    }
    if (filters.status) {
      where.status = filters.status
    }
    if (filters.statuses?.length) {
      where.status = { in: filters.statuses }
    }
    if (filters.nextRenewalDateGte || filters.nextRenewalDateLte) {
      where.nextRenewalDate = {
        ...(filters.nextRenewalDateGte ? { gte: filters.nextRenewalDateGte } : {}),
        ...(filters.nextRenewalDateLte ? { lte: filters.nextRenewalDateLte } : {})
      }
    }
    if (filters.tagIds?.length) {
      where.tags = { some: { tagId: { in: filters.tagIds } } }
    }

    return prisma.subscription.findMany({
      where,
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ createdAt: 'asc' }]
    })
  }

  const { whereClause, params } = buildSubscriptionWhere(filters)
  const rows = await d1All<SubscriptionRow>(
    `SELECT
      s.id, s.name, s.description, s.websiteUrl, s.logoUrl, s.logoSource, s.logoFetchedAt,
      s.status, s.amount, s.currency, s.billingIntervalCount, s.billingIntervalUnit,
      s.autoRenew, s.startDate, s.nextRenewalDate, s.notifyDaysBefore,
      s.advanceReminderRules, s.overdueReminderRules, s.webhookEnabled, s.notes,
      s.createdAt, s.updatedAt
     FROM Subscription s
     ${whereClause}
     ORDER BY s.createdAt ASC`,
    params
  )

  if (rows.length === 0) return []
  if (filters.includeTags === false) {
    return rows.map((row) => toSubscription(row, []))
  }

  const subscriptionIds = rows.map((row) => row.id)
  const tagRows = (
    await Promise.all(
      chunkArray(subscriptionIds, D1_IN_CLAUSE_BATCH_SIZE).map((idChunk) =>
        d1All<SubscriptionTagJoinRow>(
          `SELECT
            st.subscriptionId AS subscriptionId,
            t.id AS tagId,
            t.name AS tagName,
            t.color AS tagColor,
            t.icon AS tagIcon,
            t.sortOrder AS tagSortOrder
           FROM SubscriptionTag st
           JOIN Tag t ON t.id = st.tagId
           WHERE st.subscriptionId IN (${idChunk.map(() => '?').join(', ')})
           ORDER BY t.sortOrder ASC, t.name ASC`,
          idChunk
        )
      )
    )
  ).flat()

  const tagsBySubscription = new Map<string, SubscriptionTagJoinRow[]>()
  for (const tagRow of tagRows) {
    const current = tagsBySubscription.get(tagRow.subscriptionId) ?? []
    current.push(tagRow)
    tagsBySubscription.set(tagRow.subscriptionId, current)
  }

  return rows.map((row) => toSubscription(row, tagsBySubscription.get(row.id) ?? []))
}

export async function listStatisticsSubscriptionsLite() {
  if (!getD1()) {
    return prisma.subscription.findMany({
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ createdAt: 'asc' }]
    })
  }

  const rows = await d1All<Pick<
    SubscriptionRow,
    | 'id'
    | 'name'
    | 'amount'
    | 'currency'
    | 'status'
    | 'billingIntervalCount'
    | 'billingIntervalUnit'
    | 'autoRenew'
    | 'nextRenewalDate'
  >>(
    `SELECT
      s.id, s.name, s.amount, s.currency, s.status,
      s.billingIntervalCount, s.billingIntervalUnit, s.autoRenew, s.nextRenewalDate
     FROM Subscription s
     ORDER BY s.createdAt ASC`
  )

  if (rows.length === 0) return []

  const subscriptionIds = rows.map((row) => row.id)
  const tagRows = (
    await Promise.all(
      chunkArray(subscriptionIds, D1_IN_CLAUSE_BATCH_SIZE).map((idChunk) =>
        d1All<Pick<SubscriptionTagJoinRow, 'subscriptionId' | 'tagId' | 'tagName' | 'tagSortOrder'>>(
          `SELECT
            st.subscriptionId AS subscriptionId,
            t.id AS tagId,
            t.name AS tagName,
            t.sortOrder AS tagSortOrder
           FROM SubscriptionTag st
           JOIN Tag t ON t.id = st.tagId
           WHERE st.subscriptionId IN (${idChunk.map(() => '?').join(', ')})
           ORDER BY t.sortOrder ASC, t.name ASC`,
          idChunk
        )
      )
    )
  ).flat()

  const tagsBySubscription = new Map<string, Array<{ tag: { id: string; name: string; sortOrder: number } }>>()
  for (const tagRow of tagRows) {
    const current = tagsBySubscription.get(tagRow.subscriptionId) ?? []
    current.push({
      tag: {
        id: tagRow.tagId,
        name: tagRow.tagName,
        sortOrder: Number(tagRow.tagSortOrder)
      }
    })
    tagsBySubscription.set(tagRow.subscriptionId, current)
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as 'active' | 'paused' | 'cancelled' | 'expired',
    billingIntervalCount: Number(row.billingIntervalCount),
    billingIntervalUnit: row.billingIntervalUnit as 'day' | 'week' | 'month' | 'quarter' | 'year',
    autoRenew: parseBoolean(row.autoRenew),
    nextRenewalDate: new Date(row.nextRenewalDate),
    tags: tagsBySubscription.get(row.id) ?? []
  }))
}

export async function listCalendarSubscriptionsLite(filters: Pick<SubscriptionListFilters, 'statuses' | 'nextRenewalDateLte'> = {}) {
  if (!getD1()) {
    const where: Record<string, unknown> = {}
    if (filters.statuses?.length) {
      where.status = { in: filters.statuses }
    }
    if (filters.nextRenewalDateLte) {
      where.nextRenewalDate = { lte: filters.nextRenewalDateLte }
    }

    return prisma.subscription.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }]
    })
  }

  const clauses: string[] = []
  const params: unknown[] = []
  if (filters.statuses?.length) {
    clauses.push(`s.status IN (${filters.statuses.map(() => '?').join(', ')})`)
    params.push(...filters.statuses)
  }
  if (filters.nextRenewalDateLte) {
    clauses.push('s.nextRenewalDate <= ?')
    params.push(filters.nextRenewalDateLte.toISOString())
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const rows = await d1All<
    Pick<
      SubscriptionRow,
      | 'id'
      | 'name'
      | 'amount'
      | 'currency'
      | 'status'
      | 'billingIntervalCount'
      | 'billingIntervalUnit'
      | 'nextRenewalDate'
    >
  >(
    `SELECT
      s.id, s.name, s.amount, s.currency, s.status,
      s.billingIntervalCount, s.billingIntervalUnit, s.nextRenewalDate
     FROM Subscription s
     ${whereClause}
     ORDER BY s.createdAt ASC`,
    params
  )

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as 'active' | 'paused' | 'cancelled' | 'expired',
    billingIntervalCount: Number(row.billingIntervalCount),
    billingIntervalUnit: row.billingIntervalUnit as 'day' | 'week' | 'month' | 'quarter' | 'year',
    nextRenewalDate: new Date(row.nextRenewalDate)
  }))
}

export async function getExchangeRateSnapshotLite(baseCurrency: string) {
  if (!getD1()) {
    return prisma.exchangeRateSnapshot.findUnique({ where: { baseCurrency } })
  }

  const row = await d1First<ExchangeRateSnapshotRow>(
    `SELECT baseCurrency, ratesJson, provider, fetchedAt, isStale
     FROM ExchangeRateSnapshot
     WHERE baseCurrency = ?
     LIMIT 1`,
    [baseCurrency]
  )

  if (!row) return null

  return {
    baseCurrency: row.baseCurrency,
    ratesJson: parseD1JsonValue<Record<string, number>>(row.ratesJson),
    provider: row.provider,
    fetchedAt: new Date(row.fetchedAt),
    isStale: parseBoolean(row.isStale)
  }
}
