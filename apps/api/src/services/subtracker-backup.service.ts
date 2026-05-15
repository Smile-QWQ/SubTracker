import crypto from 'node:crypto'
import type {
  NotificationWebhookSettingsInput,
  PaymentRecordDto,
  SettingsInput,
  SubtrackerBackupAssetLogoDto,
  SubtrackerBackupCommitInput,
  SubtrackerBackupCommitResultDto,
  SubtrackerBackupInspectConflictsDto,
  SubtrackerBackupInspectInput,
  SubtrackerBackupInspectResultDto,
  SubtrackerBackupManifestDto,
  SubtrackerBackupSubscriptionDto,
  SubtrackerBackupTagDto
} from '@subtracker/shared'
import { SettingsSchema } from '@subtracker/shared'
import { zipSync } from 'fflate'
import { prisma } from '../db'
import { getRuntimeD1Database, getWorkerLogoBucket, getWorkerPublicConfig, isWorkerRuntime } from '../runtime'
import { formatDateInTimezone, parseDateInTimezone, toTimezonedDayjs } from '../utils/timezone'
import { deleteLogoStorageObject, extractLogoStorageKey, getLocalLogoLibrary, saveImportedLogoBufferToKey } from './logo.service'
import { getAppSettings, setSetting } from './settings.service'
import { getSubscriptionOrder, setSubscriptionOrder } from './subscription-order.service'
import { getPrimaryWebhookEndpoint } from './webhook.service'

const BACKUP_SCHEMA_VERSION = 1
const BACKUP_APP_NAME = 'SubTracker'
const BACKUP_SCOPE = 'business-complete' as const
const MANIFEST_ENTRY = 'manifest.json'
const LOGO_ENTRY_PREFIX = 'logos/'
const EXCLUDED_SETTING_KEYS = new Set(['authCredentials', 'authSessionSecret'])
const D1_IN_CLAUSE_BATCH_SIZE = 100

type BackupManifest = {
  schemaVersion: number
  exportedAt: string
  app: typeof BACKUP_APP_NAME
  scope: typeof BACKUP_SCOPE
  data: {
    settings: SettingsInput
    notificationWebhook: NotificationWebhookSettingsInput
    tags: SubtrackerBackupTagDto[]
    subscriptions: SubtrackerBackupSubscriptionDto[]
    paymentRecords: PaymentRecordDto[]
    subscriptionOrder: string[]
  }
  assets: {
    logos: SubtrackerBackupAssetLogoDto[]
  }
}

type SerializedSubscription = {
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
  autoRenew: boolean
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  advanceReminderRules: string | null
  overdueReminderRules: string | null
  webhookEnabled: boolean
  notes: string
  createdAt: string
  updatedAt: string
  tags: Array<{ tagId: string }>
}

type ImportCommitTraceStep = {
  step: string
  wallMs: number
  count?: number
}

type ImportCommitTrace = {
  enabled: boolean
  steps: ImportCommitTraceStep[]
}

function fileTypeFromName(filename: string) {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function buildBackupFileName(timezone: string, now = new Date()) {
  const stamp = toTimezonedDayjs(now, timezone).format('YYYY-MM-DDTHH-mm-ss')
  return `subtracker-backup-${stamp}.zip`
}

function buildWorkerImportedLogoKey(filename: string) {
  const safe = filename.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'logo.bin'
  return `logos/imports/subtracker/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safe}`
}

function defaultWebhookSettings(): NotificationWebhookSettingsInput {
  return {
    enabled: false,
    url: '',
    requestMethod: 'POST',
    headers: 'Content-Type: application/json',
    payloadTemplate: '{}',
    ignoreSsl: false
  }
}

function parseBackupManifest(raw: unknown): BackupManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('备份 manifest 格式无效')
  }

  const manifest = raw as BackupManifest
  if (manifest.app !== BACKUP_APP_NAME) {
    throw new Error('不是合法的 SubTracker 备份文件')
  }
  if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支持的备份版本：${manifest.schemaVersion}`)
  }
  if (manifest.scope !== BACKUP_SCOPE) {
    throw new Error(`不支持的备份范围：${manifest.scope}`)
  }
  if (!manifest.data || !manifest.assets) {
    throw new Error('备份 manifest 缺少关键数据')
  }

  return manifest
}

function buildBackupWarnings(manifest: BackupManifest, canUseR2: boolean) {
  const warnings: string[] = []

  if (manifest.assets.logos.length === 0) {
    warnings.push('该备份不包含本地 Logo 文件')
  }

  if (manifest.data.paymentRecords.length === 0) {
    warnings.push('该备份不包含支付记录')
  }

  if (!canUseR2 && manifest.assets.logos.length > 0) {
    warnings.push('当前 Worker 未启用 R2，恢复时会忽略 ZIP 中的本地 Logo')
  }

  warnings.push('不会恢复登录凭据、会话密钥、Webhook 历史和汇率快照')
  warnings.push('追加恢复时，订阅与支付记录按备份中的唯一标识（CUID）幂等跳过；同名标签会复用现有标签')

  return warnings
}

async function listAllSubscriptionsWithTags() {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      tags: true
    },
    orderBy: [{ createdAt: 'asc' }]
  })

  return subscriptions as unknown as SerializedSubscription[]
}

async function listAllPaymentRecords() {
  return (await prisma.paymentRecord.findMany({
    orderBy: [{ createdAt: 'asc' }]
  })) as Array<{
    id: string
    subscriptionId: string
    amount: number
    currency: string
    baseCurrency: string
    convertedAmount: number
    exchangeRate: number
    paidAt: Date
    periodStart: Date
    periodEnd: Date
    createdAt: Date
  }>
}

async function collectLogoAssets(subscriptions: SubtrackerBackupSubscriptionDto[]) {
  const logoAssets: SubtrackerBackupAssetLogoDto[] = []
  const logoBuffers: Record<string, Uint8Array> = {}
  const referencedLocalUrls = new Set(
    subscriptions.map((item) => item.logoUrl).filter((item): item is string => Boolean(item?.startsWith('/static/logos/')))
  )
  if (referencedLocalUrls.size === 0) {
    return { logoAssets, logoBuffers }
  }

  const bucket = getWorkerLogoBucket()
  const libraryItems = await getLocalLogoLibrary()
  const libraryMap = new Map(
    libraryItems
      .filter((item) => item.logoUrl && referencedLocalUrls.has(item.logoUrl))
      .map((item) => [item.logoUrl as string, item])
  )

  for (const logoUrl of referencedLocalUrls) {
    const key = extractLogoStorageKey(logoUrl)
    if (!key || !bucket) continue

    const object = await bucket.get(key)
    if (!object?.body) continue
    const buffer = new Uint8Array(await new Response(object.body).arrayBuffer())
    const filename = key.split('/').filter(Boolean).pop() || key
    const path = `${LOGO_ENTRY_PREFIX}${filename}`
    const libraryItem = libraryMap.get(logoUrl)
    logoAssets.push({
      path,
      filename,
      sourceLogoUrl: logoUrl,
      contentType: fileTypeFromName(filename),
      referencedBySubscriptionIds: subscriptions.filter((item) => item.logoUrl === logoUrl).map((item) => item.id)
    })
    logoBuffers[path] = buffer
    if (libraryItem && libraryItem.filename && libraryItem.filename !== key) {
      logoBuffers[`${LOGO_ENTRY_PREFIX}${libraryItem.filename}`] = buffer
    }
  }

  return { logoAssets, logoBuffers }
}

async function buildBackupManifest() {
  const [settings, webhookSettings, tags, subscriptions, paymentRecords, subscriptionOrder] = await Promise.all([
    getAppSettings(),
    getPrimaryWebhookEndpoint().catch(() => defaultWebhookSettings()),
    prisma.tag.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    }) as Promise<Array<{ id: string; name: string; color: string; icon: string; sortOrder: number }>>,
    listAllSubscriptionsWithTags(),
    listAllPaymentRecords(),
    getSubscriptionOrder()
  ])

  const serializedSubscriptions: SubtrackerBackupSubscriptionDto[] = subscriptions.map((subscription) => ({
    id: subscription.id,
    name: subscription.name,
    description: subscription.description,
    websiteUrl: subscription.websiteUrl ?? null,
    logoUrl: subscription.logoUrl ?? null,
    logoSource: subscription.logoSource ?? null,
    logoFetchedAt: subscription.logoFetchedAt ?? null,
    status: subscription.status as SubtrackerBackupSubscriptionDto['status'],
    amount: subscription.amount,
    currency: subscription.currency,
    billingIntervalCount: subscription.billingIntervalCount,
    billingIntervalUnit: subscription.billingIntervalUnit as SubtrackerBackupSubscriptionDto['billingIntervalUnit'],
    autoRenew: subscription.autoRenew,
    startDate: formatDateInTimezone(subscription.startDate, settings.timezone),
    nextRenewalDate: formatDateInTimezone(subscription.nextRenewalDate, settings.timezone),
    notifyDaysBefore: subscription.notifyDaysBefore,
    advanceReminderRules: subscription.advanceReminderRules ?? null,
    overdueReminderRules: subscription.overdueReminderRules ?? null,
    webhookEnabled: subscription.webhookEnabled,
    notes: subscription.notes,
    tagIds: subscription.tags.map((item) => item.tagId),
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt
  }))

  const serializedTags: SubtrackerBackupTagDto[] = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    icon: tag.icon,
    sortOrder: tag.sortOrder
  }))

  const serializedPaymentRecords: PaymentRecordDto[] = paymentRecords.map((record) => ({
    id: record.id,
    subscriptionId: record.subscriptionId,
    amount: record.amount,
    currency: record.currency,
    baseCurrency: record.baseCurrency,
    convertedAmount: record.convertedAmount,
    exchangeRate: record.exchangeRate,
    paidAt: record.paidAt.toISOString(),
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    createdAt: record.createdAt.toISOString()
  }))

  const { logoAssets, logoBuffers } = await collectLogoAssets(serializedSubscriptions)

  const manifest: BackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: BACKUP_APP_NAME,
    scope: BACKUP_SCOPE,
    data: {
      settings: SettingsSchema.parse(settings),
      notificationWebhook: webhookSettings,
      tags: serializedTags,
      subscriptions: serializedSubscriptions,
      paymentRecords: serializedPaymentRecords,
      subscriptionOrder
    },
    assets: {
      logos: logoAssets
    }
  }

  return { manifest, logoBuffers }
}

export async function createSubtrackerBackupArchive() {
  const { manifest, logoBuffers } = await buildBackupManifest()
  const archive = zipSync({
    [MANIFEST_ENTRY]: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    ...logoBuffers
  })

  return {
    filename: buildBackupFileName(manifest.data.settings.timezone),
    contentType: 'application/zip',
    buffer: Buffer.from(archive)
  }
}

async function decodeBackupArchive(input: SubtrackerBackupInspectInput) {
  const manifest = parseBackupManifest(input.manifest as SubtrackerBackupManifestDto)
  const logoAssets: Record<string, { bytes: Uint8Array; contentType: string; filename: string }> = {}

  const providedAssets = new Map((input.logoAssets ?? []).map((asset) => [asset.path, asset]))

  for (const asset of manifest.assets.logos) {
    const provided = providedAssets.get(asset.path)
    if (!provided) {
      throw new Error(`备份 ZIP 缺少 Logo 文件：${asset.path}`)
    }
    const bytes = Buffer.from(provided.base64, 'base64')
    if (!bytes.length) {
      throw new Error(`备份 ZIP 中的 Logo 内容为空：${asset.path}`)
    }
    logoAssets[asset.path] = {
      bytes,
      contentType: provided.contentType || asset.contentType,
      filename: provided.filename || asset.filename
    }
  }

  return { manifest, logoAssets }
}

async function buildInspectConflicts(manifest: BackupManifest): Promise<SubtrackerBackupInspectConflictsDto> {
  const [existingTags, existingSubscriptions, existingPaymentRecords] = await Promise.all([
    manifest.data.tags.length
      ? prisma.tag.findMany({
          where: {
            name: {
              in: manifest.data.tags.map((item) => item.name)
            }
          },
          select: {
            name: true
          }
        })
      : Promise.resolve([]),
    manifest.data.subscriptions.length
      ? prisma.subscription.findMany({
          where: {
            id: {
              in: manifest.data.subscriptions.map((item) => item.id)
            }
          },
          select: {
            id: true
          }
        })
      : Promise.resolve([]),
    manifest.data.paymentRecords.length
      ? prisma.paymentRecord.findMany({
          where: {
            id: {
              in: manifest.data.paymentRecords.map((item) => item.id)
            }
          },
          select: {
            id: true
          }
        })
      : Promise.resolve([])
  ])

  return {
    existingTagNameCount: existingTags.length,
    existingSubscriptionIdCount: existingSubscriptions.length,
    existingPaymentRecordIdCount: existingPaymentRecords.length,
    canRestoreSettings: true
  }
}

export async function inspectSubtrackerBackupFile(input: SubtrackerBackupInspectInput): Promise<SubtrackerBackupInspectResultDto> {
  const { manifest } = await decodeBackupArchive(input)
  const conflicts = await buildInspectConflicts(manifest)
  const canUseR2 = Boolean(getWorkerLogoBucket())
  return {
    isSubtrackerBackup: true,
    summary: {
      scope: BACKUP_SCOPE,
      subscriptionsTotal: manifest.data.subscriptions.length,
      tagsTotal: manifest.data.tags.length,
      paymentRecordsTotal: manifest.data.paymentRecords.length,
      logosTotal: manifest.assets.logos.length,
      includesSettings: true
    },
    warnings: buildBackupWarnings(manifest, canUseR2),
    availableModes: ['replace', 'append'],
    conflicts
  }
}

function isImportCommitTraceEnabled() {
  return process.env.SUBTRACKER_PERF_TRACE === '1'
}

function createImportCommitTrace(enabled = isImportCommitTraceEnabled()): ImportCommitTrace {
  return {
    enabled,
    steps: []
  }
}

async function traceImportCommitStep<T>(
  trace: ImportCommitTrace,
  step: string,
  run: () => Promise<T>,
  summarize?: (value: T) => Partial<ImportCommitTraceStep>
) {
  if (!trace.enabled) {
    return run()
  }

  const startedAt = performance.now()
  const result = await run()
  const elapsed = Number((performance.now() - startedAt).toFixed(2))
  trace.steps.push({
    step,
    wallMs: elapsed,
    ...(summarize ? summarize(result) : {})
  })
  return result
}

function emitImportCommitTrace(trace: ImportCommitTrace) {
  if (!trace.enabled || trace.steps.length === 0) {
    return
  }

  console.info(
    JSON.stringify({
      target: 'subtracker-backup-commit',
      trace: trace.steps
    })
  )
}

type CommitSubtrackerBackupOptions = {
  traceEnabled?: boolean
  onTrace?: (steps: ImportCommitTraceStep[]) => void
}

async function clearBusinessData() {
  await prisma.paymentRecord.deleteMany()
  await prisma.subscriptionTag.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.setting.deleteMany({
    where: {
      key: {
        notIn: Array.from(EXCLUDED_SETTING_KEYS)
      }
    }
  })

  const bucket = getWorkerLogoBucket()
  if (bucket) {
    const listed = await bucket.list()
    const targets = listed.objects.filter((item) => item.key.startsWith('logos/'))
    await Promise.all(targets.map((item) => deleteLogoStorageObject(item.key)))
  }
}

async function restoreSettingsFromBackup(settings: BackupManifest['data']['settings']) {
  await Promise.all(Object.entries(settings).map(([key, value]) => setSetting(key, value)))
}

async function restoreWebhookFromBackup(notificationWebhook: BackupManifest['data']['notificationWebhook']) {
  await setSetting('notificationWebhook', notificationWebhook)
}

async function buildTagRestoreMap(manifest: BackupManifest) {
  const existingByName = new Map(
    (await findExistingTagRowsByNames(manifest.data.tags.map((tag) => tag.name))).map((tag) => [tag.name, tag])
  )

  const idMap = new Map<string, string>()
  let importedTags = 0
  let reusedTags = 0

  for (const tag of manifest.data.tags) {
    const existing = existingByName.get(tag.name)
    if (existing) {
      idMap.set(tag.id, existing.id)
      reusedTags += 1
      continue
    }

    await prisma.tag.create({
      data: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
        sortOrder: tag.sortOrder
      }
    })
    idMap.set(tag.id, tag.id)
    importedTags += 1
  }

  return {
    tagIdMap: idMap,
    importedTags,
    reusedTags
  }
}

function findReferencedLogoAsset(subscriptionId: string, manifest: BackupManifest) {
  return manifest.assets.logos.find((item) => item.referencedBySubscriptionIds.includes(subscriptionId))
}

async function importLogoFromAsset(
  subscriptionId: string,
  manifest: BackupManifest,
  logoAssets: Record<string, { bytes: Uint8Array; contentType: string; filename: string }>
) {
  const asset = findReferencedLogoAsset(subscriptionId, manifest)
  if (!asset) return null
  const entry = logoAssets[asset.path]
  if (!entry || !getWorkerLogoBucket()) return null

  const key = buildWorkerImportedLogoKey(asset.filename)
  return saveImportedLogoBufferToKey(Buffer.from(entry.bytes), entry.contentType, key, 'backup-zip')
}

function mergeSubscriptionOrder(existingOrder: string[], incomingOrder: string[], importedIds: Set<string>) {
  const result = [...existingOrder]
  const known = new Set(result)
  for (const id of incomingOrder) {
    if (importedIds.has(id) && !known.has(id)) {
      known.add(id)
      result.push(id)
    }
  }
  return result
}

function buildFallbackAppSettings() {
  const config = getWorkerPublicConfig()
  return SettingsSchema.parse({
    baseCurrency: config.baseCurrency,
    timezone: 'Asia/Shanghai'
  })
}

function toPaymentRecordCreateManyInput(records: PaymentRecordDto[]) {
  return records.map((record) => ({
    id: record.id,
    subscriptionId: record.subscriptionId,
    amount: record.amount,
    currency: record.currency,
    baseCurrency: record.baseCurrency,
    convertedAmount: record.convertedAmount,
    exchangeRate: record.exchangeRate,
    paidAt: new Date(record.paidAt),
    periodStart: new Date(record.periodStart),
    periodEnd: new Date(record.periodEnd),
    createdAt: new Date(record.createdAt)
  }))
}

function isAppendImportNoop(result: Pick<
  SubtrackerBackupCommitResultDto,
  'mode' | 'restoredSettings' | 'importedTags' | 'importedSubscriptions' | 'importedPaymentRecords' | 'importedLogos'
>) {
  return result.mode === 'append' &&
    !result.restoredSettings &&
    result.importedTags === 0 &&
    result.importedSubscriptions === 0 &&
    result.importedPaymentRecords === 0 &&
    result.importedLogos === 0
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function findExistingTagRowsByNames(tagNames: string[]) {
  if (tagNames.length === 0) {
    return [] as Array<{ id: string; name: string }>
  }

  if (!isWorkerRuntime()) {
    return prisma.tag.findMany({
      where: {
        name: {
          in: tagNames
        }
      },
      select: {
        id: true,
        name: true
      }
    })
  }

  const db = getRuntimeD1Database()
  const rows: Array<{ id: string; name: string }> = []
  for (const batch of chunkArray(Array.from(new Set(tagNames)), D1_IN_CLAUSE_BATCH_SIZE)) {
    const placeholders = batch.map(() => '?').join(', ')
    const result = await db
      .prepare(`SELECT id, name FROM Tag WHERE name IN (${placeholders})`)
      .bind(...batch)
      .all<{ id: string; name: string }>()
    rows.push(...((result.results ?? []) as Array<{ id: string; name: string }>))
  }
  return rows
}

async function findExistingIdsByTable(
  table: 'Subscription' | 'PaymentRecord',
  ids: string[]
) {
  if (ids.length === 0) {
    return [] as Array<{ id: string }>
  }

  if (!isWorkerRuntime()) {
    if (table === 'Subscription') {
      return prisma.subscription.findMany({
        where: {
          id: {
            in: ids
          }
        },
        select: {
          id: true
        }
      })
    }

    return prisma.paymentRecord.findMany({
      where: {
        id: {
          in: ids
        }
      },
      select: {
        id: true
      }
    })
  }

  const db = getRuntimeD1Database()
  const rows: Array<{ id: string }> = []
  for (const batch of chunkArray(Array.from(new Set(ids)), D1_IN_CLAUSE_BATCH_SIZE)) {
    const placeholders = batch.map(() => '?').join(', ')
    const result = await db
      .prepare(`SELECT id FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...batch)
      .all<{ id: string }>()
    rows.push(...((result.results ?? []) as Array<{ id: string }>))
  }
  return rows
}

async function findExistingPaymentRecordIds(records: PaymentRecordDto[], mode: SubtrackerBackupCommitInput['mode']) {
  if (mode === 'replace' || records.length === 0) {
    return [] as Array<{ id: string }>
  }

  const subscriptionIds = Array.from(new Set(records.map((record) => record.subscriptionId)))

  if (!isWorkerRuntime()) {
    return prisma.paymentRecord.findMany({
      where: {
        subscriptionId: {
          in: subscriptionIds
        }
      },
      select: {
        id: true
      }
    })
  }

  const db = getRuntimeD1Database()
  const rows: Array<{ id: string }> = []
  for (const batch of chunkArray(subscriptionIds, D1_IN_CLAUSE_BATCH_SIZE)) {
    const placeholders = batch.map(() => '?').join(', ')
    const result = await db
      .prepare(`SELECT id FROM PaymentRecord WHERE subscriptionId IN (${placeholders})`)
      .bind(...batch)
      .all<{ id: string }>()
    rows.push(...((result.results ?? []) as Array<{ id: string }>))
  }
  return rows
}

export async function commitSubtrackerBackup(
  input: SubtrackerBackupCommitInput,
  options?: CommitSubtrackerBackupOptions
): Promise<SubtrackerBackupCommitResultDto> {
  const trace = createImportCommitTrace(options?.traceEnabled)
  const { manifest, logoAssets } = await traceImportCommitStep(trace, 'decode-backup-archive', () =>
    decodeBackupArchive({
      filename: 'commit-subtracker-backup.zip',
      manifest: input.manifest,
      logoAssets: input.logoAssets
    })
  )
  const previewWarnings = buildBackupWarnings(manifest, Boolean(getWorkerLogoBucket()))

  const appSettings = (() => {
    try {
      return SettingsSchema.parse(manifest.data.settings)
    } catch {
      return buildFallbackAppSettings()
    }
  })()

  if (input.mode === 'replace') {
    await traceImportCommitStep(trace, 'clear-business-data', () => clearBusinessData())
  }

  const { tagIdMap, importedTags, reusedTags } = await traceImportCommitStep(
    trace,
    'build-tag-restore-map',
    () => buildTagRestoreMap(manifest),
    (value) => ({ count: value.importedTags + value.reusedTags })
  )
  const existingSubscriptionIds = new Set(
    (
      await traceImportCommitStep(
        trace,
        'lookup-existing-subscriptions',
        () => findExistingIdsByTable('Subscription', manifest.data.subscriptions.map((item) => item.id)),
        (rows) => ({ count: rows.length })
      )
    ).map((item) => item.id)
  )
  const existingPaymentRecordIds = new Set(
    (
      await traceImportCommitStep(
        trace,
        'lookup-existing-payment-records',
        () => findExistingPaymentRecordIds(manifest.data.paymentRecords, input.mode),
        (rows) => ({ count: rows.length })
      )
    ).map((item) => item.id)
  )

  let importedSubscriptions = 0
  let skippedSubscriptions = 0
  let importedPaymentRecords = 0
  let skippedPaymentRecords = 0
  let importedLogos = 0
  const importedIds = new Set<string>()
  const subscriptionTagRows: Array<{ subscriptionId: string; tagId: string }> = []
  const paymentRecordRows: PaymentRecordDto[] = []

  await traceImportCommitStep(
    trace,
    'write-subscriptions',
    async () => {
      for (const subscription of manifest.data.subscriptions) {
        if (input.mode === 'append' && existingSubscriptionIds.has(subscription.id)) {
          skippedSubscriptions += 1
          continue
        }

        const importedLogo = subscription.logoUrl?.startsWith('/static/logos/')
          ? await importLogoFromAsset(subscription.id, manifest, logoAssets)
          : null

        if (importedLogo) {
          importedLogos += 1
        }

        await prisma.subscription.create({
          data: {
            id: subscription.id,
            name: subscription.name,
            description: subscription.description,
            websiteUrl: subscription.websiteUrl,
            logoUrl: importedLogo?.logoUrl ?? (getWorkerLogoBucket() ? null : subscription.logoUrl),
            logoSource: importedLogo?.logoSource ?? (getWorkerLogoBucket() ? null : subscription.logoSource),
            logoFetchedAt: importedLogo ? new Date() : null,
            status: subscription.status,
            amount: subscription.amount,
            currency: subscription.currency,
            billingIntervalCount: subscription.billingIntervalCount,
            billingIntervalUnit: subscription.billingIntervalUnit,
            autoRenew: subscription.autoRenew,
            startDate: parseDateInTimezone(subscription.startDate, appSettings.timezone),
            nextRenewalDate: parseDateInTimezone(subscription.nextRenewalDate, appSettings.timezone),
            notifyDaysBefore: subscription.notifyDaysBefore,
            advanceReminderRules: subscription.advanceReminderRules,
            overdueReminderRules: subscription.overdueReminderRules,
            webhookEnabled: subscription.webhookEnabled,
            notes: subscription.notes,
            createdAt: new Date(subscription.createdAt),
            updatedAt: new Date(subscription.updatedAt)
          }
        })

        importedIds.add(subscription.id)
        for (const backupTagId of subscription.tagIds) {
          const resolvedTagId = tagIdMap.get(backupTagId)
          if (!resolvedTagId) continue
          subscriptionTagRows.push({
            subscriptionId: subscription.id,
            tagId: resolvedTagId
          })
        }

        importedSubscriptions += 1
      }
    },
    () => ({ count: importedSubscriptions })
  )

  if (subscriptionTagRows.length > 0) {
    await traceImportCommitStep(
      trace,
      'write-subscription-tags',
      () =>
        prisma.subscriptionTag.createMany({
          data: subscriptionTagRows
        }),
      () => ({ count: subscriptionTagRows.length })
    )
  }

  for (const record of manifest.data.paymentRecords) {
    if (input.mode === 'append' && existingPaymentRecordIds.has(record.id)) {
      skippedPaymentRecords += 1
      continue
    }

    paymentRecordRows.push(record)
    importedPaymentRecords += 1
  }

  if (paymentRecordRows.length > 0) {
    await traceImportCommitStep(
      trace,
      'write-payment-records',
      () =>
        prisma.paymentRecord.createMany({
          data: toPaymentRecordCreateManyInput(paymentRecordRows)
        }),
      () => ({ count: paymentRecordRows.length })
    )
  }

  if (input.mode === 'replace') {
    await traceImportCommitStep(trace, 'restore-replace-followups', async () => {
      await setSubscriptionOrder(manifest.data.subscriptionOrder.filter((id) => importedIds.has(id)))
      await restoreSettingsFromBackup(manifest.data.settings)
      await restoreWebhookFromBackup(manifest.data.notificationWebhook)
    })
  } else {
    await traceImportCommitStep(trace, 'restore-append-followups', async () => {
      if (importedIds.size > 0) {
        const mergedOrder = mergeSubscriptionOrder(await getSubscriptionOrder(), manifest.data.subscriptionOrder, importedIds)
        await setSubscriptionOrder(mergedOrder)
      }

      if (input.restoreSettings) {
        await restoreSettingsFromBackup(manifest.data.settings)
        await restoreWebhookFromBackup(manifest.data.notificationWebhook)
      }
    })
  }

  const result = {
    mode: input.mode,
    clearedExistingData: input.mode === 'replace',
    restoredSettings: input.mode === 'replace' || input.restoreSettings,
    importedTags,
    reusedTags,
    importedSubscriptions,
    skippedSubscriptions,
    importedPaymentRecords,
    skippedPaymentRecords,
    importedLogos,
    warnings: previewWarnings
  }

  if (trace.enabled && trace.steps.length > 0) {
    options?.onTrace?.(trace.steps)
  }
  emitImportCommitTrace(trace)
  return result
}
