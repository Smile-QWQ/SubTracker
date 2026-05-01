import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import AdmZip, { type IZipEntry } from 'adm-zip'
import initSqlJs from 'sql.js'
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js'
import { DEFAULT_TIMEZONE } from '@subtracker/shared'
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
import { addInterval } from '../utils/date'
import { formatDateInTimezone, normalizeAppTimezone, parseDateInTimezone } from '../utils/timezone'
import { getAppSettings, getAppTimezone } from './settings.service'
import { appendSubscriptionOrders } from './subscription-order.service'
import { saveImportedLogoBuffer } from './logo.service'

const REQUIRED_TABLES = ['subscriptions', 'categories', 'currencies', 'cycles', 'frequencies'] as const
const IMPORT_TOKEN_TTL_MS = 15 * 60 * 1000
const require = createRequire(import.meta.url)

type SqlDatabase = SqlJsDatabase
type ImportFileType = 'json' | 'db' | 'zip'
type WallosPreviewSettings = {
  defaultNotifyDays: number
  baseCurrency: string
  timezone: string
}

const DEFAULT_WALLOS_PREVIEW_SETTINGS: WallosPreviewSettings = {
  defaultNotifyDays: 3,
  baseCurrency: 'CNY',
  timezone: DEFAULT_TIMEZONE
}

type WallosSubscriptionRow = {
  id: number
  name: string
  logo: string | null
  price: number | null
  next_payment: string | null
  cycle: number | null
  frequency: number | null
  notes: string | null
  notify: number | null
  url: string | null
  inactive: number | null
  notify_days_before: number | null
  cancellation_date: string | null
  start_date: string | number | null
  auto_renew: number | null
  currency_code: string | null
  category_id: number | null
  category_name: string | null
  cycle_days: number | null
  frequency_name: number | null
  category_sort_order: number | null
}

type WallosJsonRow = Record<string, unknown>

type ZipLogoAsset = {
  filename: string
  buffer: Buffer
  contentType: string
}

type ImportCacheEntry = {
  expiresAt: number
  preview: WallosImportInspectResultDto
  zipLogos: Map<string, ZipLogoAsset>
}

const previewCache = new Map<string, ImportCacheEntry>()
const sqlJsPromise = initSqlJs({
  locateFile: (file: string) => path.resolve(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), file)
})
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

function cleanupExpiredImports() {
  const now = Date.now()
  for (const [token, entry] of previewCache.entries()) {
    if (entry.expiresAt <= now) {
      previewCache.delete(token)
    }
  }
}

function getImportedTagColor(name: string) {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return IMPORT_TAG_COLORS[hash % IMPORT_TAG_COLORS.length]
}

function createImportId() {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const timestamp = Date.now().toString(36).slice(-8)
  return `c${timestamp}${random}`.slice(0, 25)
}

function openDatabase(buffer: Buffer) {
  return sqlJsPromise.then((SQL: SqlJsStatic) => new SQL.Database(new Uint8Array(buffer)))
}

function queryRows<T extends Record<string, unknown>>(db: SqlDatabase, sql: string): T[] {
  const statement = db.prepare(sql)
  const rows: T[] = []

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
    return rows
  } finally {
    statement.free()
  }
}

function extractTableNames(db: SqlDatabase) {
  return queryRows<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).map((item) => String(item.name))
}

function extractTableColumnNames(db: SqlDatabase, tableName: string) {
  return new Set(
    queryRows<{ name: string }>(db, `PRAGMA table_info(${tableName})`).map((item) => String(item.name))
  )
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

function detectImportFileType(input: WallosImportInspectInput, buffer: Buffer): ImportFileType {
  const filename = input.filename.toLowerCase()
  const trimmed = buffer.toString('utf8', 0, Math.min(buffer.length, 80)).trimStart()

  if (filename.endsWith('.zip') || buffer.subarray(0, 2).toString('hex') === '504b') {
    return 'zip'
  }
  if (filename.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return 'json'
  }
  return 'db'
}

function decodeDatabase(input: WallosImportInspectInput) {
  const buffer = Buffer.from(input.base64, 'base64')
  if (!buffer.length) {
    throw new Error('数据库文件内容为空')
  }
  return buffer
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

export function resolveWallosEffectiveNextPayment(input: {
  nextPayment?: string | null
  autoRenew?: boolean | null
  billingIntervalCount?: number | null
  billingIntervalUnit?: BillingIntervalUnit | null
  inactive?: number | boolean | null
  cancellationDate?: string | null
  today?: Date | string
  sourceTimezone?: string
}) {
  const parsedNextPayment = parseDate(input.nextPayment)
  if (!parsedNextPayment) return null

  const sourceTimezone = normalizeAppTimezone(input.sourceTimezone)
  let effectiveDate = parsedNextPayment
  const today = formatDateInTimezone(input.today ?? new Date(), sourceTimezone)
  const canAutoAdvance =
    Boolean(input.autoRenew) &&
    !input.inactive &&
    !parseDate(input.cancellationDate) &&
    Number(input.billingIntervalCount) > 0 &&
    input.billingIntervalUnit

  if (!canAutoAdvance) {
    return effectiveDate
  }

  let guard = 0
  while (effectiveDate < today && guard < 3660) {
    effectiveDate = formatDateInTimezone(
      addInterval(effectiveDate, Number(input.billingIntervalCount), input.billingIntervalUnit as BillingIntervalUnit, sourceTimezone),
      sourceTimezone
    )
    guard += 1
  }

  return effectiveDate
}

export function mapWallosSubscriptionStatus(input: {
  inactive?: number | null
  cancellationDate?: string | null
  nextPayment?: string | null
  autoRenew?: boolean | null
  billingIntervalCount?: number | null
  billingIntervalUnit?: BillingIntervalUnit | null
  today?: Date | string
  sourceTimezone?: string
}) {
  if (input.inactive) return 'paused' as SubscriptionStatus
  if (parseDate(input.cancellationDate)) return 'cancelled' as SubscriptionStatus

  const nextPayment = resolveWallosEffectiveNextPayment(input)
  if (nextPayment) {
    const today = formatDateInTimezone(input.today ?? new Date(), normalizeAppTimezone(input.sourceTimezone))
    if (nextPayment < today) {
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

  if (input.notifyDaysBefore === null || input.notifyDaysBefore === undefined || input.notifyDaysBefore <= 0) {
    return { webhookEnabled: true, notifyDaysBefore: Math.max(input.globalNotifyDays, 0) }
  }

  return { webhookEnabled: true, notifyDaysBefore: Math.max(input.notifyDaysBefore, 0) }
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

function inferContentTypeFromFilename(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return ''
}

function normalizeZipLogoName(filename: string) {
  return path.basename(filename).toLowerCase()
}

function scoreZipDatabasePath(entryName: string) {
  const normalized = entryName.replace(/\\/g, '/').toLowerCase()
  let score = 0

  if (normalized.endsWith('/wallos.db') || normalized === 'wallos.db') score += 100
  if (normalized.includes('/db/')) score += 40
  if (normalized.includes('wallos')) score += 30
  if (normalized.endsWith('.db')) score += 20
  if (normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')) score += 18
  if (normalized.includes('__macosx/')) score -= 100

  return score
}

function extractZipImport(buffer: Buffer) {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()
  const dbEntry = entries
    .filter((entry: IZipEntry) => !entry.isDirectory)
    .filter((entry: IZipEntry) => /\.(db|sqlite|sqlite3)$/i.test(entry.entryName))
    .sort((a, b) => scoreZipDatabasePath(b.entryName) - scoreZipDatabasePath(a.entryName))[0]

  if (!dbEntry) {
    throw new Error('ZIP 中未找到 db/wallos.db')
  }

  const zipLogos = new Map<string, ZipLogoAsset>()

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const filename = path.basename(entry.entryName)
    const contentType = inferContentTypeFromFilename(filename)
    if (!contentType) continue
    if (entry.entryName === dbEntry.entryName) continue

    zipLogos.set(normalizeZipLogoName(filename), {
      filename,
      buffer: entry.getData(),
      contentType
    })
  }

  return {
    dbBuffer: dbEntry.getData(),
    zipLogos
  }
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

  let warning: string | null = null
  if (!amountMatch) {
    warning = `价格 "${text}" 无法完整解析，已回退为 0 ${currency}`
  } else if (/\$/.test(normalized) && !/usd|dollar/i.test(normalized)) {
    warning = `价格 "${text}" 的币种符号存在歧义，已默认按 USD 导入`
  } else if (/¥/.test(normalized) && !/yuan|cny|rmb/i.test(normalized)) {
    warning = `价格 "${text}" 的币种符号存在歧义，已默认按 CNY 导入`
  } else if (!/[a-z￥¥€£$]/i.test(normalized)) {
    warning = `价格 "${text}" 未包含明确币种，已默认按 CNY 导入`
  }

  return {
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
    warning
  }
}

function normalizeWallosWebsiteUrl(input: unknown) {
  const raw = String(input ?? '')
    .replace(/&amp;/g, '&')
    .trim()
  if (!raw) {
    return { websiteUrl: null, warning: null as string | null }
  }

  const tryParse = (value: string) => {
    try {
      const parsed = new URL(value)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null
      return parsed.toString()
    } catch {
      return null
    }
  }

  const direct = tryParse(raw)
  if (direct) {
    return { websiteUrl: direct, warning: null as string | null }
  }

  const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(raw)
  if (looksLikeDomain) {
    const withHttps = tryParse(`https://${raw}`)
    if (withHttps) {
      return {
        websiteUrl: withHttps,
        warning: `网址 "${raw}" 缺少协议，已自动补全为 ${withHttps}`
      }
    }
  }

  return {
    websiteUrl: null,
    warning: `网址 "${raw}" 无法识别为合法链接，已忽略`
  }
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

function mapJsonStatus(row: WallosJsonRow, today?: Date | string, sourceTimezone?: string) {
  const active = String(row.Active ?? '').trim().toLowerCase()
  const state = String(row.State ?? '').trim().toLowerCase()
  const cancellationDate = parseDate(row['Cancellation Date'])
  const nextPayment = parseDate(row['Next Payment'])
  const cycle = parsePaymentCycle(row['Payment Cycle'])
  const autoRenew = mapJsonAutoRenew(row)

  if (cancellationDate) return 'cancelled' as SubscriptionStatus
  if (active === 'no' || state === 'disabled') return 'paused' as SubscriptionStatus

  if (nextPayment) {
    const effectiveNextPayment = resolveWallosEffectiveNextPayment({
      nextPayment,
      autoRenew,
      billingIntervalCount: cycle.billingIntervalCount,
      billingIntervalUnit: cycle.billingIntervalUnit,
      inactive: active === 'no' || state === 'disabled',
      cancellationDate,
      today,
      sourceTimezone
    })
    const todayDate = formatDateInTimezone(today ?? new Date(), normalizeAppTimezone(sourceTimezone))
    if (effectiveNextPayment && effectiveNextPayment < todayDate) {
      return 'expired' as SubscriptionStatus
    }
  }

  return 'active' as SubscriptionStatus
}

function resolveJsonEffectiveNextPayment(row: WallosJsonRow, today?: Date | string, sourceTimezone?: string) {
  const nextPayment = parseDate(row['Next Payment'])
  if (!nextPayment) return null

  const active = String(row.Active ?? '').trim().toLowerCase()
  const state = String(row.State ?? '').trim().toLowerCase()
  const cycle = parsePaymentCycle(row['Payment Cycle'])
  return resolveWallosEffectiveNextPayment({
    nextPayment,
    autoRenew: mapJsonAutoRenew(row),
    billingIntervalCount: cycle.billingIntervalCount,
    billingIntervalUnit: cycle.billingIntervalUnit,
    inactive: active === 'no' || state === 'disabled',
    cancellationDate: parseDate(row['Cancellation Date']),
    today,
    sourceTimezone
  })
}

function resolveDbEffectiveNextPayment(
  row: WallosSubscriptionRow,
  mappedInterval: { billingIntervalCount: number; billingIntervalUnit: BillingIntervalUnit },
  today?: Date | string,
  sourceTimezone?: string
) {
  return resolveWallosEffectiveNextPayment({
    nextPayment: row.next_payment,
    autoRenew: Boolean(row.auto_renew),
    billingIntervalCount: mappedInterval.billingIntervalCount,
    billingIntervalUnit: mappedInterval.billingIntervalUnit,
    inactive: row.inactive,
    cancellationDate: row.cancellation_date,
    today,
    sourceTimezone
  })
}

function pushRowWarning(warnings: string[], rowWarnings: string[], prefix: string, warning: string | null | undefined) {
  if (!warning) return
  warnings.push(`${prefix} ${warning}`)
  rowWarnings.push(warning)
}

function buildJsonStartDateWarning() {
  return 'Wallos JSON 不包含 start_date，已使用 Next Payment 代填开始日期'
}

function buildJsonDerivedWarnings(row: WallosJsonRow) {
  const warnings: string[] = []
  const price = parsePriceString(row.Price)
  if (price.warning) warnings.push(price.warning)
  const cycle = parsePaymentCycle(row['Payment Cycle'])
  if (cycle.warning) warnings.push(cycle.warning)
  warnings.push(buildJsonStartDateWarning())
  const normalizedUrl = normalizeWallosWebsiteUrl(row.URL)
  if (normalizedUrl.warning) warnings.push(normalizedUrl.warning)
  return {
    price,
    cycle,
    normalizedUrl,
    warnings
  }
}

function buildJsonPreview(
  rows: WallosJsonRow[],
  settings: { defaultNotifyDays: number; baseCurrency: string; timezone: string },
  sourceTimezone: string
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

    const tagName = normalizeWallosTagName(String(row.Category ?? ''))
    const rowWarnings: string[] = []
    const derived = buildJsonDerivedWarnings(row)

    derived.warnings.forEach((warning) => {
      pushRowWarning(warnings, rowWarnings, `json#${index + 1}`, warning)
    })

    if (tagName) {
      tags.add(tagName, index + 1, index + 1)
    }

    previewSubscriptions.push({
      sourceId: index + 1,
      name,
      amount: derived.price.amount,
      currency: derived.price.currency,
      status: mapJsonStatus(row, undefined, sourceTimezone),
      autoRenew: mapJsonAutoRenew(row),
      billingIntervalCount: derived.cycle.billingIntervalCount,
      billingIntervalUnit: derived.cycle.billingIntervalUnit,
      startDate: nextPayment,
      nextRenewalDate: resolveJsonEffectiveNextPayment(row, undefined, sourceTimezone) ?? nextPayment,
      notifyDaysBefore: settings.defaultNotifyDays,
      webhookEnabled: mapJsonWebhookEnabled(row),
      notes: String(row.Notes ?? ''),
      description: '',
      websiteUrl: derived.normalizedUrl.websiteUrl,
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

function mapJsonWebhookEnabled(row: WallosJsonRow) {
  return String(row.Notifications ?? '').trim().toLowerCase() === 'enabled'
}

function mapJsonAutoRenew(row: WallosJsonRow) {
  return String(row.Renewal ?? '').trim().toLowerCase() === 'automatic'
}

function buildDbPreview(
  rows: WallosSubscriptionRow[],
  settings: { defaultNotifyDays: number; baseCurrency: string; timezone: string },
  globalNotifyDays: number,
  fileType: ImportFileType,
  zipLogos = new Map<string, ZipLogoAsset>(),
  sourceTimezone = settings.timezone
): Omit<WallosImportInspectResultDto, 'importToken'> {
  const warnings: string[] = []
  const fallbackToday = formatDateInTimezone(new Date(), sourceTimezone)
  let skippedSubscriptions = 0
  let zipLogoMatched = 0
  let zipLogoMissing = 0
  const previewSubscriptions: WallosImportSubscriptionPreviewDto[] = []
  const tags = buildTagCollection()

  for (const row of rows) {
    if (!row.name || row.price === null || row.price === undefined || !row.next_payment) {
      skippedSubscriptions += 1
      warnings.push(`subscription#${row.id} 缺少关键字段，已跳过`)
      continue
    }

    const mappedInterval = mapWallosBillingInterval(row.cycle_days, row.frequency_name)
    const effectiveNextRenewalDate = resolveDbEffectiveNextPayment(row, mappedInterval, undefined, sourceTimezone)
    const mappedStatus = mapWallosSubscriptionStatus({
      inactive: row.inactive,
      cancellationDate: row.cancellation_date,
      nextPayment: row.next_payment,
      autoRenew: Boolean(row.auto_renew),
      billingIntervalCount: mappedInterval.billingIntervalCount,
      billingIntervalUnit: mappedInterval.billingIntervalUnit,
      sourceTimezone
    })
    const notifyConfig = resolveWallosNotifyDays({
      notify: row.notify,
      notifyDaysBefore: row.notify_days_before,
      globalNotifyDays
    })
    const normalizedTag = normalizeWallosTagName(row.category_name)
    const rowWarnings: string[] = []
    const normalizedUrl = normalizeWallosWebsiteUrl(row.url)

    if (mappedInterval.warning) {
      warnings.push(`subscription#${row.id} ${mappedInterval.warning}`)
      rowWarnings.push(mappedInterval.warning)
    }
    pushRowWarning(warnings, rowWarnings, `subscription#${row.id}`, normalizedUrl.warning)

    if (normalizedTag) {
      tags.add(normalizedTag, row.category_id, row.category_sort_order)
    }

    let logoImportStatus: WallosImportSubscriptionPreviewDto['logoImportStatus'] = 'none'
    const effectiveLogoRef = fileType === 'zip' && row.logo ? String(row.logo) : null

    if (fileType === 'zip' && row.logo) {
      const normalizedLogoName = normalizeZipLogoName(String(row.logo))
      if (zipLogos.has(normalizedLogoName)) {
        logoImportStatus = 'ready-from-zip'
        zipLogoMatched += 1
      } else {
        logoImportStatus = 'pending-file-match'
        zipLogoMissing += 1
        warnings.push(`subscription#${row.id} 存在 Logo 文件引用，当前包内未匹配到图片`)
        rowWarnings.push('Logo 文件需后续通过目录或 zip 包补齐')
      }
    }

    previewSubscriptions.push({
      sourceId: Number(row.id),
      name: String(row.name),
      amount: Number(row.price),
      currency: String(row.currency_code || settings.baseCurrency || 'CNY').toUpperCase(),
      status: mappedStatus,
      autoRenew: Boolean(row.auto_renew),
      billingIntervalCount: mappedInterval.billingIntervalCount,
      billingIntervalUnit: mappedInterval.billingIntervalUnit,
      startDate: parseDate(row.start_date) ?? parseDate(row.next_payment) ?? fallbackToday,
      nextRenewalDate: effectiveNextRenewalDate ?? parseDate(row.next_payment) ?? fallbackToday,
      notifyDaysBefore: notifyConfig.notifyDaysBefore,
      webhookEnabled: notifyConfig.webhookEnabled,
      notes: String(row.notes || ''),
      description: '',
      websiteUrl: normalizedUrl.websiteUrl,
      tagNames: normalizedTag ? [normalizedTag] : [],
      logoRef: effectiveLogoRef,
      logoImportStatus,
      warnings: rowWarnings
    })
  }

  const usedTags = tags.toArray()

  return {
    isWallos: true,
    summary: {
      fileType,
      subscriptionsTotal: rows.length,
      tagsTotal: usedTags.length,
      usedTagsTotal: usedTags.length,
      supportedSubscriptions: previewSubscriptions.length,
      skippedSubscriptions,
      globalNotifyDays,
      zipLogoMatched,
      zipLogoMissing
    },
    tags: usedTags,
    usedTags,
    subscriptionsPreview: previewSubscriptions,
    warnings: ensureUniqueWarnings(warnings)
  }
}

async function buildDbPreviewFromBuffer(
  buffer: Buffer,
  fileType: ImportFileType,
  zipLogos: Map<string, ZipLogoAsset>,
  options?: {
    defaultNotifyDays?: number
    baseCurrency?: string
    sourceTimezone?: string
  }
) {
  const settings: WallosPreviewSettings =
    options?.defaultNotifyDays !== undefined || options?.baseCurrency || options?.sourceTimezone
      ? {
          defaultNotifyDays: options?.defaultNotifyDays ?? DEFAULT_WALLOS_PREVIEW_SETTINGS.defaultNotifyDays,
          baseCurrency: options?.baseCurrency ?? DEFAULT_WALLOS_PREVIEW_SETTINGS.baseCurrency,
          timezone: normalizeAppTimezone(options?.sourceTimezone ?? DEFAULT_WALLOS_PREVIEW_SETTINGS.timezone)
        }
      : await getAppSettings()

  const db = await openDatabase(buffer)

  try {
    const tables = new Set(extractTableNames(db))
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table))
    if (missingTables.length > 0) {
      throw new Error(`缺少 Wallos 关键表：${missingTables.join(', ')}`)
    }

    const globalNotifyRow = queryRows<{ days: number | null }>(db, 'SELECT days FROM notification_settings LIMIT 1')[0]
    const globalNotifyDays = globalNotifyRow?.days ?? settings.defaultNotifyDays ?? 3
    const subscriptionColumns = extractTableColumnNames(db, 'subscriptions')
    const selectSubscriptionColumn = (columnName: string, fallbackSql = 'NULL') =>
      subscriptionColumns.has(columnName) ? `s.${columnName}` : `${fallbackSql} AS ${columnName}`

    const rows = queryRows<WallosSubscriptionRow>(
      db,
      `
      SELECT
        s.id,
        s.name,
        s.logo,
        s.price,
        s.next_payment,
        s.cycle,
        s.frequency,
        s.notes,
        s.notify,
        s.url,
        s.inactive,
        ${selectSubscriptionColumn('notify_days_before', '0')},
        ${selectSubscriptionColumn('cancellation_date')},
        ${selectSubscriptionColumn('start_date')},
        ${selectSubscriptionColumn('auto_renew', '1')},
        c.code AS currency_code,
        cat.id AS category_id,
        cat.name AS category_name,
        cy.days AS cycle_days,
        f.name AS frequency_name,
        cat."order" AS category_sort_order
      FROM subscriptions s
      LEFT JOIN currencies c ON c.id = s.currency_id
      LEFT JOIN categories cat ON cat.id = s.category_id
      LEFT JOIN cycles cy ON cy.id = s.cycle
      LEFT JOIN frequencies f ON f.id = s.frequency
      ORDER BY s.id
      `
    )

    const sourceTimezone = normalizeAppTimezone(options?.sourceTimezone ?? settings.timezone)
    return buildDbPreview(rows, settings, globalNotifyDays, fileType, zipLogos, sourceTimezone)
  } finally {
    db.close()
  }
}

async function inspectZipImport(buffer: Buffer, options?: { defaultNotifyDays?: number; baseCurrency?: string; sourceTimezone?: string }) {
  const extracted = extractZipImport(buffer)
  const preview = await buildDbPreviewFromBuffer(extracted.dbBuffer, 'zip', extracted.zipLogos, options)
  return {
    preview,
    zipLogos: extracted.zipLogos
  }
}

async function inspectJsonImport(buffer: Buffer, options?: { defaultNotifyDays?: number; baseCurrency?: string; sourceTimezone?: string }) {
  let parsed: unknown
  try {
    parsed = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new Error('JSON 解析失败')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Wallos JSON 导出内容必须是数组')
  }

  const settings: WallosPreviewSettings =
    options?.defaultNotifyDays !== undefined || options?.baseCurrency || options?.sourceTimezone
      ? {
          defaultNotifyDays: options?.defaultNotifyDays ?? DEFAULT_WALLOS_PREVIEW_SETTINGS.defaultNotifyDays,
          baseCurrency: options?.baseCurrency ?? DEFAULT_WALLOS_PREVIEW_SETTINGS.baseCurrency,
          timezone: normalizeAppTimezone(options?.sourceTimezone ?? DEFAULT_WALLOS_PREVIEW_SETTINGS.timezone)
        }
      : await getAppSettings()
  const sourceTimezone = normalizeAppTimezone(options?.sourceTimezone ?? settings.timezone)
  return {
    preview: buildJsonPreview(parsed as WallosJsonRow[], settings, sourceTimezone),
    zipLogos: new Map<string, ZipLogoAsset>()
  }
}

async function inspectDbImport(buffer: Buffer, options?: { defaultNotifyDays?: number; baseCurrency?: string; sourceTimezone?: string }) {
  const preview = await buildDbPreviewFromBuffer(buffer, 'db', new Map<string, ZipLogoAsset>(), options)
  return {
    preview,
    zipLogos: new Map<string, ZipLogoAsset>()
  }
}

async function inspectImportBuffer(input: WallosImportInspectInput, options?: { defaultNotifyDays?: number; baseCurrency?: string; sourceTimezone?: string }) {
  const buffer = decodeDatabase(input)
  const fileType = detectImportFileType(input, buffer)

  switch (fileType) {
    case 'json':
      return inspectJsonImport(buffer, { ...options, sourceTimezone: input.sourceTimezone ?? options?.sourceTimezone })
    case 'zip':
      return inspectZipImport(buffer, { ...options, sourceTimezone: input.sourceTimezone ?? options?.sourceTimezone })
    case 'db':
    default:
      return inspectDbImport(buffer, { ...options, sourceTimezone: input.sourceTimezone ?? options?.sourceTimezone })
  }
}

export async function inspectWallosImportFile(input: WallosImportInspectInput): Promise<WallosImportInspectResultDto> {
  cleanupExpiredImports()

  const { preview, zipLogos } = await inspectImportBuffer(input)
  const importToken = crypto.randomBytes(24).toString('hex')
  const cachedPreview: WallosImportInspectResultDto = {
    ...preview,
    importToken
  }

  previewCache.set(importToken, {
    expiresAt: Date.now() + IMPORT_TOKEN_TTL_MS,
    preview: cachedPreview,
    zipLogos
  })

  return cachedPreview
}

export async function commitWallosImport(input: WallosImportCommitInput): Promise<WallosImportCommitResultDto> {
  cleanupExpiredImports()

  const entry = previewCache.get(input.importToken)
  if (!entry || entry.expiresAt <= Date.now()) {
    previewCache.delete(input.importToken)
    throw new Error('导入令牌不存在或已失效，请重新生成预览')
  }

  const preview = entry.preview
  const zipLogos = entry.zipLogos
  previewCache.delete(input.importToken)
  const appTimezone = await getAppTimezone()

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
  let importedLogos = 0

  const missingTags = preview.usedTags.filter((tag) => !tagIdByName.has(tag.name))
  if (missingTags.length > 0) {
    await prisma.tag.createMany({
      data: missingTags.map((tag) => ({
        name: tag.name,
        color: getImportedTagColor(tag.name),
        sortOrder: tag.sortOrder
      }))
    })
    importedTags = missingTags.length

    const refreshedTags = await prisma.tag.findMany({
      where: {
        name: {
          in: preview.usedTags.map((item) => item.name)
        }
      }
    })
    tagIdByName.clear()
    refreshedTags.forEach((tag) => {
      tagIdByName.set(tag.name, tag.id)
    })
  }

  const createdSubscriptionIds: string[] = []
  const subscriptionRows: Array<{
    id: string
    name: string
    description: string
    amount: number
    currency: string
    billingIntervalCount: number
    billingIntervalUnit: BillingIntervalUnit
    autoRenew: boolean
    startDate: Date
    nextRenewalDate: Date
    notifyDaysBefore: number
    webhookEnabled: boolean
    notes: string
    websiteUrl: string | null
    logoUrl: string | null
    logoSource: string | null
    logoFetchedAt: Date | null
    status: SubscriptionStatus
  }> = []
  const subscriptionTagRows: Array<{ subscriptionId: string; tagId: string }> = []

  for (const item of preview.subscriptionsPreview) {
    const tagIds = item.tagNames
      .map((name) => tagIdByName.get(name))
      .filter((value): value is string => Boolean(value))

    let logoUrl: string | null = null
    let logoSource: string | null = null
    let logoFetchedAt: Date | null = null

    if (item.logoRef) {
      const asset = zipLogos.get(normalizeZipLogoName(item.logoRef))
      if (asset) {
        const imported = await saveImportedLogoBuffer(asset.buffer, asset.contentType, 'wallos-zip')
        logoUrl = imported.logoUrl
        logoSource = imported.logoSource
        logoFetchedAt = new Date()
        importedLogos += 1
      }
    }

    const subscriptionId = createImportId()
    createdSubscriptionIds.push(subscriptionId)
    subscriptionRows.push({
      id: subscriptionId,
      name: item.name,
      description: item.description,
      amount: item.amount,
      currency: item.currency,
      billingIntervalCount: item.billingIntervalCount,
      billingIntervalUnit: item.billingIntervalUnit,
      autoRenew: item.autoRenew,
      startDate: parseDateInTimezone(item.startDate, appTimezone),
      nextRenewalDate: parseDateInTimezone(item.nextRenewalDate, appTimezone),
      notifyDaysBefore: item.notifyDaysBefore,
      webhookEnabled: item.webhookEnabled,
      notes: item.notes,
      websiteUrl: item.websiteUrl ?? null,
      logoUrl,
      logoSource,
      logoFetchedAt,
      status: item.status
    })
    tagIds.forEach((tagId) => {
      subscriptionTagRows.push({
        subscriptionId,
        tagId
      })
    })
    importedSubscriptions += 1
  }

  if (subscriptionRows.length > 0) {
    await prisma.subscription.createMany({
      data: subscriptionRows
    })
  }

  if (subscriptionTagRows.length > 0) {
    await prisma.subscriptionTag.createMany({
      data: subscriptionTagRows
    })
  }

  await appendSubscriptionOrders(createdSubscriptionIds)

  return {
    importedTags,
    importedSubscriptions,
    skippedSubscriptions: preview.summary.skippedSubscriptions,
    importedLogos,
    warnings: preview.warnings
  }
}

export async function previewWallosImportFromBase64(input: WallosImportInspectInput) {
  const result = await inspectImportBuffer(input)
  return result.preview
}

export async function previewWallosImportFromBase64ForTest(
  input: WallosImportInspectInput,
  options?: {
    defaultNotifyDays?: number
    baseCurrency?: string
    sourceTimezone?: string
  }
) {
  const result = await inspectImportBuffer(input, options)
  return result.preview
}
