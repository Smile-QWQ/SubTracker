import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js'
import { unzipSync } from 'fflate'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type {
  WallosImportInspectResult,
  WallosImportLogoAsset,
  WallosImportPreparedPayload,
  WallosImportSubscriptionPreview
} from '@/types/api'

type BillingIntervalUnit = WallosImportSubscriptionPreview['billingIntervalUnit']
type SubscriptionStatus = WallosImportSubscriptionPreview['status']
type ImportFileType = WallosImportPreparedPayload['fileType']
type WallosJsonRow = Record<string, unknown>
type ZipLogoAsset = {
  filename: string
  bytes: Uint8Array
  contentType: string
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

type PreparedImportOptions = {
  defaultNotifyDays: number
  baseCurrency: string
  today?: Date | string
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null

function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = import('sql.js').then((module) =>
      module.default({
        locateFile: () => sqlWasmUrl
      })
    )
  }
  return sqlJsPromise
}

async function openDatabase(bytes: Uint8Array) {
  const SQL = await getSqlJs()
  return new SQL.Database(bytes)
}

function queryRows<T extends Record<string, unknown>>(db: SqlJsDatabase, sql: string) {
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

function extractTableNames(db: SqlJsDatabase) {
  return queryRows<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).map((item) => String(item.name))
}

function extractTableColumnNames(db: SqlJsDatabase, tableName: string) {
  return new Set(queryRows<{ name: string }>(db, `PRAGMA table_info(${tableName})`).map((item) => String(item.name)))
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

function startOfUtcDay(value: Date | string = new Date()) {
  const date = new Date(value)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function addInterval(dateValue: Date | string, count: number, unit: BillingIntervalUnit) {
  const date = new Date(dateValue)
  if (unit === 'day') date.setUTCDate(date.getUTCDate() + count)
  if (unit === 'week') date.setUTCDate(date.getUTCDate() + count * 7)
  if (unit === 'month') date.setUTCMonth(date.getUTCMonth() + count)
  if (unit === 'quarter') date.setUTCMonth(date.getUTCMonth() + count * 3)
  if (unit === 'year') date.setUTCFullYear(date.getUTCFullYear() + count)
  return date
}

function mapWallosBillingInterval(days: number | null | undefined, frequency: number | null | undefined) {
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
      warning: null as string | null
    }
  }

  return {
    billingIntervalCount: days * freq,
    billingIntervalUnit: 'day' as BillingIntervalUnit,
    warning: `cycle.days=${days} 无法直接映射，已转为每 ${days * freq} 天`
  }
}

function resolveWallosEffectiveNextPayment(input: {
  nextPayment?: string | null
  autoRenew?: boolean | null
  billingIntervalCount?: number | null
  billingIntervalUnit?: BillingIntervalUnit | null
  inactive?: number | boolean | null
  cancellationDate?: string | null
  today?: Date | string
}) {
  const parsedNextPayment = parseDate(input.nextPayment)
  if (!parsedNextPayment) return null

  let effectiveDate = startOfUtcDay(`${parsedNextPayment}T00:00:00Z`)
  const today = startOfUtcDay(input.today ?? new Date())
  const canAutoAdvance =
    Boolean(input.autoRenew) &&
    !input.inactive &&
    !parseDate(input.cancellationDate) &&
    Number(input.billingIntervalCount) > 0 &&
    input.billingIntervalUnit

  if (!canAutoAdvance) {
    return effectiveDate.toISOString().slice(0, 10)
  }

  let guard = 0
  while (effectiveDate.getTime() < today.getTime() && guard < 3660) {
    effectiveDate = startOfUtcDay(
      addInterval(effectiveDate, Number(input.billingIntervalCount), input.billingIntervalUnit as BillingIntervalUnit)
    )
    guard += 1
  }

  return effectiveDate.toISOString().slice(0, 10)
}

function mapWallosSubscriptionStatus(input: {
  inactive?: number | null
  cancellationDate?: string | null
  nextPayment?: string | null
  autoRenew?: boolean | null
  billingIntervalCount?: number | null
  billingIntervalUnit?: BillingIntervalUnit | null
  today?: Date | string
}) {
  if (input.inactive) return 'paused' as SubscriptionStatus
  if (parseDate(input.cancellationDate)) return 'cancelled' as SubscriptionStatus

  const nextPayment = resolveWallosEffectiveNextPayment(input)
  if (nextPayment) {
    const nextDate = startOfUtcDay(`${nextPayment}T00:00:00Z`)
    const today = startOfUtcDay(input.today ?? new Date())
    if (nextDate.getTime() < today.getTime()) {
      return 'expired' as SubscriptionStatus
    }
  }

  return 'active' as SubscriptionStatus
}

function resolveWallosNotifyDays(input: {
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

function basename(input: string) {
  const normalized = input.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || normalized
}

function normalizeZipLogoName(filename: string) {
  return basename(filename).toLowerCase()
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

function extractZipImport(bytes: Uint8Array) {
  const entries = unzipSync(bytes)
  const dbEntryName = Object.keys(entries)
    .filter((entryName) => /\.(db|sqlite|sqlite3)$/i.test(entryName))
    .sort((a, b) => scoreZipDatabasePath(b) - scoreZipDatabasePath(a))[0]

  if (!dbEntryName) {
    throw new Error('ZIP 中未找到 db/wallos.db')
  }

  const zipLogos = new Map<string, ZipLogoAsset>()
  for (const [entryName, entryBytes] of Object.entries(entries)) {
    if (entryName === dbEntryName) continue
    const filename = basename(entryName)
    const contentType = inferContentTypeFromFilename(filename)
    if (!contentType) continue

    zipLogos.set(normalizeZipLogoName(filename), {
      filename,
      bytes: entryBytes,
      contentType
    })
  }

  return {
    dbBytes: entries[dbEntryName],
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
      warning: null as string | null
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
      warning: null as string | null
    }
  }

  return {
    billingIntervalCount: 1,
    billingIntervalUnit: 'month' as BillingIntervalUnit,
    warning: `Payment Cycle "${text}" 无法完整解析，已回退为每 1 月`
  }
}

function mapJsonAutoRenew(row: WallosJsonRow) {
  return String(row.Renewal ?? '').trim().toLowerCase() === 'automatic'
}

function mapJsonWebhookEnabled(row: WallosJsonRow) {
  return String(row.Notifications ?? '').trim().toLowerCase() === 'enabled'
}

function resolveJsonEffectiveNextPayment(row: WallosJsonRow, today?: Date | string) {
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
    today
  })
}

function mapJsonStatus(row: WallosJsonRow, today?: Date | string) {
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
      today
    })
    const nextDate = effectiveNextPayment ? startOfUtcDay(`${effectiveNextPayment}T00:00:00Z`) : null
    const todayDate = startOfUtcDay(today ?? new Date())
    if (nextDate && nextDate.getTime() < todayDate.getTime()) {
      return 'expired' as SubscriptionStatus
    }
  }

  return 'active' as SubscriptionStatus
}

function buildTagCollection() {
  const map = new Map<string, { sourceId: number; name: string; sortOrder: number }>()
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

function buildJsonPreview(rows: WallosJsonRow[], options: PreparedImportOptions): Omit<WallosImportInspectResult, 'importToken'> {
  const warnings: string[] = []
  const previewSubscriptions: WallosImportSubscriptionPreview[] = []
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
    derived.warnings.forEach((warning) => pushRowWarning(warnings, rowWarnings, `json#${index + 1}`, warning))

    if (tagName) {
      tags.add(tagName, index + 1, index + 1)
    }

    previewSubscriptions.push({
      sourceId: index + 1,
      name,
      amount: derived.price.amount,
      currency: derived.price.currency,
      status: mapJsonStatus(row, options.today),
      autoRenew: mapJsonAutoRenew(row),
      billingIntervalCount: derived.cycle.billingIntervalCount,
      billingIntervalUnit: derived.cycle.billingIntervalUnit,
      startDate: nextPayment,
      nextRenewalDate: resolveJsonEffectiveNextPayment(row, options.today) ?? nextPayment,
      notifyDaysBefore: options.defaultNotifyDays,
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
      globalNotifyDays: options.defaultNotifyDays,
      zipLogoMatched: 0,
      zipLogoMissing: 0
    },
    tags: usedTags,
    usedTags,
    subscriptionsPreview: previewSubscriptions,
    warnings: ensureUniqueWarnings(warnings)
  }
}

function resolveDbEffectiveNextPayment(
  row: WallosSubscriptionRow,
  mappedInterval: { billingIntervalCount: number; billingIntervalUnit: BillingIntervalUnit },
  today?: Date | string
) {
  return resolveWallosEffectiveNextPayment({
    nextPayment: row.next_payment,
    autoRenew: Boolean(row.auto_renew),
    billingIntervalCount: mappedInterval.billingIntervalCount,
    billingIntervalUnit: mappedInterval.billingIntervalUnit,
    inactive: row.inactive,
    cancellationDate: row.cancellation_date,
    today
  })
}

function buildDbPreview(
  rows: WallosSubscriptionRow[],
  options: PreparedImportOptions,
  globalNotifyDays: number,
  fileType: ImportFileType,
  zipLogos = new Map<string, ZipLogoAsset>()
) {
  const warnings: string[] = []
  let skippedSubscriptions = 0
  let zipLogoMatched = 0
  let zipLogoMissing = 0
  const previewSubscriptions: WallosImportSubscriptionPreview[] = []
  const tags = buildTagCollection()

  for (const row of rows) {
    if (!row.name || row.price === null || row.price === undefined || !row.next_payment) {
      skippedSubscriptions += 1
      warnings.push(`subscription#${row.id} 缺少关键字段，已跳过`)
      continue
    }

    const mappedInterval = mapWallosBillingInterval(row.cycle_days, row.frequency_name)
    const effectiveNextRenewalDate = resolveDbEffectiveNextPayment(row, mappedInterval, options.today)
    const mappedStatus = mapWallosSubscriptionStatus({
      inactive: row.inactive,
      cancellationDate: row.cancellation_date,
      nextPayment: row.next_payment,
      autoRenew: Boolean(row.auto_renew),
      billingIntervalCount: mappedInterval.billingIntervalCount,
      billingIntervalUnit: mappedInterval.billingIntervalUnit,
      today: options.today
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

    let logoImportStatus: WallosImportSubscriptionPreview['logoImportStatus'] = 'none'
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
      currency: String(row.currency_code || options.baseCurrency || 'CNY').toUpperCase(),
      status: mappedStatus,
      autoRenew: Boolean(row.auto_renew),
      billingIntervalCount: mappedInterval.billingIntervalCount,
      billingIntervalUnit: mappedInterval.billingIntervalUnit,
      startDate: parseDate(row.start_date) ?? parseDate(row.next_payment) ?? new Date().toISOString().slice(0, 10),
      nextRenewalDate: effectiveNextRenewalDate ?? parseDate(row.next_payment) ?? new Date().toISOString().slice(0, 10),
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
  } satisfies Omit<WallosImportInspectResult, 'importToken'>
}

async function buildDbPreviewFromBytes(
  bytes: Uint8Array,
  options: PreparedImportOptions,
  fileType: ImportFileType,
  zipLogos = new Map<string, ZipLogoAsset>()
) {
  const db = await openDatabase(bytes)
  try {
    const tables = new Set(extractTableNames(db))
    const requiredTables = ['subscriptions', 'categories', 'currencies', 'cycles', 'frequencies']
    const missingTables = requiredTables.filter((table) => !tables.has(table))
    if (missingTables.length > 0) {
      throw new Error(`缺少 Wallos 关键表：${missingTables.join(', ')}`)
    }

    const globalNotifyRow = queryRows<{ days: number | null }>(db, 'SELECT days FROM notification_settings LIMIT 1')[0]
    const globalNotifyDays = globalNotifyRow?.days ?? options.defaultNotifyDays
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

    return buildDbPreview(rows, options, globalNotifyDays, fileType, zipLogos)
  } finally {
    db.close()
  }
}

function detectImportFileType(file: File, bytes: Uint8Array): ImportFileType {
  const filename = file.name.toLowerCase()
  const trimmed = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 80))).trimStart()
  if (filename.endsWith('.zip') || bytes.subarray(0, 2).toString() === '80,75') {
    return 'zip'
  }
  if (filename.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return 'json'
  }
  return 'db'
}

function toBase64(bytes: Uint8Array) {
  if (typeof btoa !== 'function') {
    const bufferCtor = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer
    if (!bufferCtor) {
      throw new Error('当前环境无法进行 base64 编码')
    }
    return bufferCtor.from(bytes).toString('base64')
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function parseJsonFile(bytes: Uint8Array, options: PreparedImportOptions) {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('JSON 解析失败')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Wallos JSON 导出内容必须是数组')
  }

  return {
    fileType: 'json' as const,
    preview: buildJsonPreview(parsed as WallosJsonRow[], options),
    logoAssets: [] as WallosImportLogoAsset[]
  }
}

async function parseDbFile(bytes: Uint8Array, options: PreparedImportOptions) {
  return {
    fileType: 'db' as const,
    preview: await buildDbPreviewFromBytes(bytes, options, 'db'),
    logoAssets: [] as WallosImportLogoAsset[]
  }
}

async function parseZipFile(bytes: Uint8Array, options: PreparedImportOptions) {
  const extracted = extractZipImport(bytes)
  const preview = await buildDbPreviewFromBytes(extracted.dbBytes, options, 'zip', extracted.zipLogos)
  const logoAssets: WallosImportLogoAsset[] = preview.subscriptionsPreview
    .filter((item) => item.logoImportStatus === 'ready-from-zip' && item.logoRef)
    .map((item) => normalizeZipLogoName(String(item.logoRef)))
    .filter((logoRef, index, array) => array.indexOf(logoRef) === index)
    .map((logoRef) => {
      const asset = extracted.zipLogos.get(logoRef)
      if (!asset) return null
      return {
        logoRef: asset.filename,
        filename: asset.filename,
        contentType: asset.contentType,
        base64: toBase64(asset.bytes)
      } satisfies WallosImportLogoAsset
    })
    .filter((item): item is WallosImportLogoAsset => Boolean(item))

  return {
    fileType: 'zip' as const,
    preview,
    logoAssets
  }
}

export async function buildPreparedWallosImportPayload(
  file: File,
  options: PreparedImportOptions
): Promise<WallosImportPreparedPayload> {
  const bytes = new Uint8Array(
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as ArrayBuffer)
          reader.onerror = () => reject(reader.error ?? new Error('读取导入文件失败'))
          reader.readAsArrayBuffer(file)
        })
  )
  if (!bytes.length) {
    throw new Error('导入文件内容为空')
  }

  const fileType = detectImportFileType(file, bytes)
  const parsed =
    fileType === 'json'
      ? await parseJsonFile(bytes, options)
      : fileType === 'db'
        ? await parseDbFile(bytes, options)
        : await parseZipFile(bytes, options)

  return {
    filename: file.name,
    fileType: parsed.fileType,
    preview: parsed.preview,
    logoAssets: parsed.logoAssets
  }
}
