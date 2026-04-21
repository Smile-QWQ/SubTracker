import type {
  BillingIntervalUnit,
  SubscriptionStatus,
  WallosImportCommitInput,
  WallosImportCommitResultDto,
  WallosImportInspectInput,
  WallosImportInspectResultDto,
  WallosImportSubscriptionPreviewDto,
  WallosImportTagDto
} from '@subtracker/shared'
import { prisma } from '../db'
import { getWorkerCache } from '../runtime'
import { getAppSettings, getSetting, setSetting } from './settings.service'
import { appendSubscriptionOrder } from './subscription-order.service'
import { replaceSubscriptionTags } from './tag.service'

const IMPORT_TOKEN_TTL_SECONDS = 15 * 60
const IMPORT_TOKEN_TTL_MS = IMPORT_TOKEN_TTL_SECONDS * 1000
const IMPORT_PREVIEW_PREFIX = 'wallosImportPreview:'
const IMPORT_TAG_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#6366f1'
]

type WallosJsonRow = Record<string, unknown>
type StoredPreviewEntry = {
  expiresAt: number
  preview: WallosImportInspectResultDto
}

function decodeBase64(value: string) {
  const binary = atob(value.trim())
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

function getImportedTagColor(name: string) {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return IMPORT_TAG_COLORS[hash % IMPORT_TAG_COLORS.length]
}

async function getStoredPreview(token: string) {
  const kv = getWorkerCache()
  if (kv) {
    return (await kv.get(`${IMPORT_PREVIEW_PREFIX}${token}`, 'json')) as StoredPreviewEntry | null
  }

  return getSetting<StoredPreviewEntry | null>(`${IMPORT_PREVIEW_PREFIX}${token}`, null)
}

async function setStoredPreview(token: string, entry: StoredPreviewEntry) {
  const kv = getWorkerCache()
  if (kv) {
    await kv.put(`${IMPORT_PREVIEW_PREFIX}${token}`, JSON.stringify(entry), {
      expirationTtl: IMPORT_TOKEN_TTL_SECONDS
    })
    return
  }

  await setSetting(`${IMPORT_PREVIEW_PREFIX}${token}`, entry)
}

async function deleteStoredPreview(token: string) {
  const kv = getWorkerCache()
  if (kv) {
    await kv.delete(`${IMPORT_PREVIEW_PREFIX}${token}`)
    return
  }

  await setSetting(`${IMPORT_PREVIEW_PREFIX}${token}`, null)
}

function normalizeWallosTagName(name: string | null | undefined) {
  const value = String(name ?? '').trim()
  if (!value) return null
  if (value.toLowerCase() === 'no category') return null
  return value
}

function parseDate(value: unknown) {
  if (value === null || value === undefined || value === '' || value === 0) return null

  if (typeof value === 'number') {
    const date = new Date(value * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }

  const text = String(value).trim()
  if (!text) return null

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function parsePriceString(input: unknown) {
  const text = String(input ?? '').trim()
  if (!text) {
    return { amount: 0, currency: 'CNY', warning: '价格为空，已回退为 0 CNY' }
  }

  const normalized = text.replace(/,/g, '')
  const amountMatch = normalized.match(/-?\d+(?:\.\d+)?/)
  const amount = amountMatch ? Number(amountMatch[0]) : 0

  let currency = 'CNY'
  if (/¥|yuan|cny|rmb/i.test(normalized)) currency = 'CNY'
  else if (/\$|usd|dollar/i.test(normalized)) currency = 'USD'
  else if (/€|eur/i.test(normalized)) currency = 'EUR'
  else if (/£|gbp/i.test(normalized)) currency = 'GBP'
  else if (/jpy|yen|￥/i.test(normalized)) currency = 'JPY'

  return {
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
    warning: amountMatch ? null : `价格 "${text}" 无法完整解析，已回退为 0 ${currency}`
  }
}

export function mapWallosBillingInterval(days: number | null | undefined, frequency: number | null | undefined) {
  const freq = Math.max(Number(frequency || 1), 1)

  if (!days) {
    return {
      billingIntervalCount: 1,
      billingIntervalUnit: 'month' as BillingIntervalUnit,
      warning: 'cycle 缺失，已回退为每 1 月'
    }
  }

  const knownUnits: Record<number, BillingIntervalUnit> = {
    1: 'day',
    7: 'week',
    30: 'month',
    90: 'quarter',
    365: 'year'
  }

  if (knownUnits[days]) {
    return {
      billingIntervalCount: freq,
      billingIntervalUnit: knownUnits[days],
      warning: null
    }
  }

  return {
    billingIntervalCount: days * freq,
    billingIntervalUnit: 'day' as BillingIntervalUnit,
    warning: `cycle.days=${days} 无法直接映射，已转为每 ${days * freq} 天`
  }
}

export function mapWallosSubscriptionStatus(input: {
  inactive?: number | null
  cancellationDate?: string | null
  nextPayment?: string | null
}) {
  if (input.inactive) return 'paused' as SubscriptionStatus
  if (parseDate(input.cancellationDate)) return 'cancelled' as SubscriptionStatus

  const nextPayment = parseDate(input.nextPayment)
  if (nextPayment) {
    const nextDate = new Date(`${nextPayment}T00:00:00Z`)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    if (nextDate.getTime() < today.getTime()) {
      return 'expired' as SubscriptionStatus
    }
  }

  return 'active' as SubscriptionStatus
}

export function resolveWallosNotifyDays(input: {
  notify?: number | null
  notifyDaysBefore?: number | null
  globalNotifyDays: number
}) {
  const enabled = Boolean(input.notify)
  if (!enabled) {
    return { webhookEnabled: false, notifyDaysBefore: Math.max(input.globalNotifyDays, 0) }
  }

  if (input.notifyDaysBefore === null || input.notifyDaysBefore === undefined || input.notifyDaysBefore < 0) {
    return { webhookEnabled: true, notifyDaysBefore: Math.max(input.globalNotifyDays, 0) }
  }

  return { webhookEnabled: true, notifyDaysBefore: Math.max(input.notifyDaysBefore, 0) }
}

function parsePaymentCycle(input: unknown) {
  const text = String(input ?? '').trim()
  const normalized = text.toLowerCase()

  const directMap: Record<string, { count: number; unit: BillingIntervalUnit }> = {
    daily: { count: 1, unit: 'day' },
    weekly: { count: 1, unit: 'week' },
    monthly: { count: 1, unit: 'month' },
    quarterly: { count: 1, unit: 'quarter' },
    yearly: { count: 1, unit: 'year' },
    annually: { count: 1, unit: 'year' }
  }

  if (directMap[normalized]) {
    return {
      billingIntervalCount: directMap[normalized].count,
      billingIntervalUnit: directMap[normalized].unit,
      warning: null
    }
  }

  const everyMatch = normalized.match(/^every\s+(\d+)\s+(day|days|week|weeks|month|months|quarter|quarters|year|years)$/i)
  if (everyMatch) {
    const count = Number(everyMatch[1])
    const unitRaw = everyMatch[2].toLowerCase()
    const unitMap: Record<string, BillingIntervalUnit> = {
      day: 'day',
      days: 'day',
      week: 'week',
      weeks: 'week',
      month: 'month',
      months: 'month',
      quarter: 'quarter',
      quarters: 'quarter',
      year: 'year',
      years: 'year'
    }

    return {
      billingIntervalCount: count,
      billingIntervalUnit: unitMap[unitRaw] ?? 'month',
      warning: null
    }
  }

  return {
    billingIntervalCount: 1,
    billingIntervalUnit: 'month' as BillingIntervalUnit,
    warning: `Payment Cycle "${text}" 无法完整解析，已回退为每 1 月`
  }
}

function mapJsonStatus(row: WallosJsonRow) {
  const active = String(row.Active ?? '').trim().toLowerCase()
  const state = String(row.State ?? '').trim().toLowerCase()
  const cancellationDate = parseDate(row['Cancellation Date'])
  const nextPayment = parseDate(row['Next Payment'])

  if (cancellationDate) return 'cancelled' as SubscriptionStatus
  if (active === 'no' || state === 'disabled') return 'paused' as SubscriptionStatus

  if (nextPayment) {
    const nextDate = new Date(`${nextPayment}T00:00:00Z`)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    if (nextDate.getTime() < today.getTime()) {
      return 'expired' as SubscriptionStatus
    }
  }

  return 'active' as SubscriptionStatus
}

function mapJsonWebhookEnabled(row: WallosJsonRow) {
  return String(row.Notifications ?? '').trim().toLowerCase() === 'enabled'
}

function mapJsonAutoRenew(row: WallosJsonRow) {
  return String(row.Renewal ?? '').trim().toLowerCase() === 'automatic'
}

function buildTagCollection() {
  const map = new Map<string, WallosImportTagDto>()

  return {
    add(name: string | null, sourceId?: number | null, sortOrder?: number | null) {
      const normalized = normalizeWallosTagName(name)
      if (!normalized || map.has(normalized)) return
      map.set(normalized, {
        sourceId: Number(sourceId ?? 0),
        name: normalized,
        sortOrder: Number(sortOrder ?? 0)
      })
    },
    toArray() {
      return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'))
    }
  }
}

function ensureUniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings))
}

function buildJsonPreview(
  rows: WallosJsonRow[],
  settings: { defaultNotifyDays: number; baseCurrency: string }
): Omit<WallosImportInspectResultDto, 'importToken'> {
  const warnings: string[] = []
  const previewSubscriptions: WallosImportSubscriptionPreviewDto[] = []
  const tags = buildTagCollection()
  let skippedSubscriptions = 0

  rows.forEach((row, index) => {
    const name = String(row.Name ?? '').trim()
    const nextPayment = parseDate(row['Next Payment'])
    if (!name || !nextPayment) {
      skippedSubscriptions += 1
      warnings.push(`json#${index + 1} 缺少名称或下次支付时间，已跳过`)
      return
    }

    const price = parsePriceString(row.Price)
    const cycle = parsePaymentCycle(row['Payment Cycle'])
    const tagName = normalizeWallosTagName(String(row.Category ?? ''))
    const rowWarnings: string[] = []

    if (price.warning) {
      warnings.push(`json#${index + 1} ${price.warning}`)
      rowWarnings.push(price.warning)
    }
    if (cycle.warning) {
      warnings.push(`json#${index + 1} ${cycle.warning}`)
      rowWarnings.push(cycle.warning)
    }

    if (tagName) {
      tags.add(tagName, index + 1, index + 1)
    }

    previewSubscriptions.push({
      sourceId: index + 1,
      name,
      amount: price.amount,
      currency: price.currency,
      status: mapJsonStatus(row),
      autoRenew: mapJsonAutoRenew(row),
      billingIntervalCount: cycle.billingIntervalCount,
      billingIntervalUnit: cycle.billingIntervalUnit,
      startDate: nextPayment,
      nextRenewalDate: nextPayment,
      notifyDaysBefore: settings.defaultNotifyDays,
      webhookEnabled: mapJsonWebhookEnabled(row),
      notes: String(row.Notes ?? ''),
      description: '',
      websiteUrl: row.URL ? String(row.URL).replace(/&amp;/g, '&') : null,
      tagNames: tagName ? [tagName] : [],
      logoRef: null,
      logoImportStatus: 'none',
      warnings: rowWarnings
    })
  })

  const usedTags = tags.toArray()

  return {
    isWallos: true,
    summary: {
      fileType: 'json',
      subscriptionsTotal: rows.length,
      tagsTotal: usedTags.length,
      usedTagsTotal: usedTags.length,
      supportedSubscriptions: previewSubscriptions.length,
      skippedSubscriptions,
      globalNotifyDays: settings.defaultNotifyDays,
      zipLogoMatched: 0,
      zipLogoMissing: 0
    },
    tags: usedTags,
    usedTags,
    subscriptionsPreview: previewSubscriptions,
    warnings: ensureUniqueWarnings(warnings)
  }
}

export async function inspectWallosImportFile(input: WallosImportInspectInput): Promise<WallosImportInspectResultDto> {
  if (!/\.json$/i.test(input.filename) && !String(input.contentType || '').includes('json')) {
    throw new Error('Cloudflare Worker 版本目前仅支持 Wallos JSON 导入')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decodeBase64(input.base64))
  } catch {
    throw new Error('JSON 解析失败')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Wallos JSON 导出内容必须是数组')
  }

  const settings = await getAppSettings()
  const token = crypto.randomUUID().replaceAll('-', '')
  const preview: WallosImportInspectResultDto = {
    ...buildJsonPreview(parsed as WallosJsonRow[], settings),
    importToken: token
  }

  await setStoredPreview(token, {
    expiresAt: Date.now() + IMPORT_TOKEN_TTL_MS,
    preview
  })

  return preview
}

export async function commitWallosImport(input: WallosImportCommitInput): Promise<WallosImportCommitResultDto> {
  const entry = await getStoredPreview(input.importToken)
  if (!entry || entry.expiresAt <= Date.now()) {
    await deleteStoredPreview(input.importToken)
    throw new Error('导入令牌不存在或已失效，请重新生成预览')
  }

  const preview = entry.preview
  await deleteStoredPreview(input.importToken)

  const existingTags = await prisma.tag.findMany({
    where: {
      name: {
        in: preview.usedTags.map((item) => item.name)
      }
    }
  })

  const tagIdByName = new Map(existingTags.map((item) => [item.name, item.id]))
  let importedTags = 0
  let importedSubscriptions = 0

  for (const tag of preview.usedTags) {
    if (tagIdByName.has(tag.name)) continue

    const created = await prisma.tag.create({
      data: {
        name: tag.name,
        color: getImportedTagColor(tag.name),
        sortOrder: tag.sortOrder
      }
    })
    tagIdByName.set(created.name, created.id)
    importedTags += 1
  }

  for (const item of preview.subscriptionsPreview) {
    const tagIds = item.tagNames
      .map((name) => tagIdByName.get(name))
      .filter((value): value is string => Boolean(value))

    const created = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          name: item.name,
          description: item.description,
          amount: item.amount,
          currency: item.currency,
          billingIntervalCount: item.billingIntervalCount,
          billingIntervalUnit: item.billingIntervalUnit,
          autoRenew: item.autoRenew,
          startDate: new Date(`${item.startDate}T00:00:00.000Z`),
          nextRenewalDate: new Date(`${item.nextRenewalDate}T00:00:00.000Z`),
          notifyDaysBefore: item.notifyDaysBefore,
          webhookEnabled: item.webhookEnabled,
          notes: item.notes,
          websiteUrl: item.websiteUrl ?? null,
          status: item.status
        }
      })

      await replaceSubscriptionTags(tx, subscription.id, tagIds)
      return subscription
    })

    await appendSubscriptionOrder(created.id)
    importedSubscriptions += 1
  }

  return {
    importedTags,
    importedSubscriptions,
    skippedSubscriptions: preview.summary.skippedSubscriptions,
    importedLogos: 0,
    warnings: preview.warnings
  }
}

export async function previewWallosImportFromBase64(input: WallosImportInspectInput) {
  const settings = await getAppSettings()
  const parsed = JSON.parse(decodeBase64(input.base64))
  if (!Array.isArray(parsed)) {
    throw new Error('Wallos JSON 导出内容必须是数组')
  }
  return buildJsonPreview(parsed as WallosJsonRow[], settings)
}

export async function previewWallosImportFromBase64ForTest(
  input: WallosImportInspectInput,
  options?: {
    defaultNotifyDays?: number
    baseCurrency?: string
  }
) {
  const parsed = JSON.parse(decodeBase64(input.base64))
  if (!Array.isArray(parsed)) {
    throw new Error('Wallos JSON 导出内容必须是数组')
  }
  return buildJsonPreview(parsed as WallosJsonRow[], {
    defaultNotifyDays: options?.defaultNotifyDays ?? 3,
    baseCurrency: options?.baseCurrency ?? 'CNY'
  })
}
