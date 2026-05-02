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
import { getWorkerLogoBucket, getWorkerPublicConfig, isWorkerRuntime } from '../runtime'
import { formatDateInTimezone, parseDateInTimezone, toTimezonedDayjs } from '../utils/timezone'
import { deleteLogoStorageObject, extractLogoStorageKey, getLocalLogoLibrary, saveImportedLogoBufferToKey } from './logo.service'
import { getAppSettings, setSetting } from './settings.service'
import { getSubscriptionOrder, setSubscriptionOrder } from './subscription-order.service'
import { getPrimaryWebhookEndpoint } from './webhook.service'
import { deleteImportPreview, getImportPreview, storeImportPreview } from './worker-lite-state.service'

const IMPORT_TOKEN_TTL_MS = 15 * 60 * 1000
const BACKUP_SCHEMA_VERSION = 1
const BACKUP_APP_NAME = 'SubTracker'
const BACKUP_SCOPE = 'business-complete' as const
const MANIFEST_ENTRY = 'manifest.json'
const LOGO_ENTRY_PREFIX = 'logos/'
const EXCLUDED_SETTING_KEYS = new Set(['authCredentials', 'authSessionSecret'])

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

type CachedImportEntry = {
  manifest: BackupManifest
  logoAssets: Record<string, { bytes: Uint8Array; contentType: string; filename: string }>
  preview: Omit<SubtrackerBackupInspectResultDto, 'importToken'>
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

function createImportToken() {
  return crypto.randomBytes(24).toString('hex')
}

function buildWorkerImportPrefix(token: string) {
  return `logos/imports/subtracker/${token}/`
}

function buildWorkerImportedLogoKey(importToken: string, filename: string) {
  const safe = filename.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'logo.bin'
  return `${buildWorkerImportPrefix(importToken)}${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`
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

async function cleanupImportedPreviewAssets(_payload: CachedImportEntry | null, token: string) {
  const bucket = getWorkerLogoBucket()
  if (!bucket) return
  const prefix = buildWorkerImportPrefix(token)
  const listed = await bucket.list()
  const targets = listed.objects.filter((item) => item.key.startsWith(prefix))
  if (!targets.length) return
  await Promise.all(targets.map((item) => deleteLogoStorageObject(item.key)))
}

export async function inspectSubtrackerBackupFile(input: SubtrackerBackupInspectInput): Promise<SubtrackerBackupInspectResultDto> {
  const { manifest, logoAssets } = await decodeBackupArchive(input)
  const conflicts = await buildInspectConflicts(manifest)
  const canUseR2 = Boolean(getWorkerLogoBucket())
  const importToken = createImportToken()
  const previewPayload: Omit<SubtrackerBackupInspectResultDto, 'importToken'> = {
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

  await storeImportPreview<CachedImportEntry>(
    importToken,
    {
      manifest,
      logoAssets,
      preview: previewPayload
    },
    IMPORT_TOKEN_TTL_MS
  )

  return {
    ...previewPayload,
    importToken
  }
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
    (
      await prisma.tag.findMany({
        where: {
          name: {
            in: manifest.data.tags.map((tag) => tag.name)
          }
        }
      })
    ).map((tag) => [tag.name, tag])
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
  importToken: string,
  subscriptionId: string,
  manifest: BackupManifest,
  logoAssets: CachedImportEntry['logoAssets']
) {
  const asset = findReferencedLogoAsset(subscriptionId, manifest)
  if (!asset) return null
  const entry = logoAssets[asset.path]
  if (!entry || !getWorkerLogoBucket()) return null

  const key = buildWorkerImportedLogoKey(importToken, asset.filename)
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

export async function commitSubtrackerBackup(input: SubtrackerBackupCommitInput): Promise<SubtrackerBackupCommitResultDto> {
  const cached = await getImportPreview<CachedImportEntry>(input.importToken, {
    onExpired: cleanupImportedPreviewAssets
  })

  if (!cached) {
    throw new Error('导入令牌不存在或已失效，请重新生成预览')
  }

  const { manifest, logoAssets, preview } = cached
  await deleteImportPreview<CachedImportEntry>(input.importToken, {
    payload: cached,
    onDelete: () => undefined
  })

  const appSettings = (() => {
    try {
      return SettingsSchema.parse(manifest.data.settings)
    } catch {
      return buildFallbackAppSettings()
    }
  })()

  if (input.mode === 'replace') {
    await clearBusinessData()
  }

  const { tagIdMap, importedTags, reusedTags } = await buildTagRestoreMap(manifest)
  const existingSubscriptionIds = new Set(
    (
      await prisma.subscription.findMany({
        where: {
          id: {
            in: manifest.data.subscriptions.map((item) => item.id)
          }
        },
        select: {
          id: true
        }
      })
    ).map((item) => item.id)
  )
  const existingPaymentRecordIds = new Set(
    (
      await prisma.paymentRecord.findMany({
        where: {
          id: {
            in: manifest.data.paymentRecords.map((item) => item.id)
          }
        },
        select: {
          id: true
        }
      })
    ).map((item) => item.id)
  )

  let importedSubscriptions = 0
  let skippedSubscriptions = 0
  let importedPaymentRecords = 0
  let skippedPaymentRecords = 0
  let importedLogos = 0
  const importedIds = new Set<string>()
  const subscriptionTagRows: Array<{ subscriptionId: string; tagId: string }> = []

  for (const subscription of manifest.data.subscriptions) {
    if (input.mode === 'append' && existingSubscriptionIds.has(subscription.id)) {
      skippedSubscriptions += 1
      continue
    }

    const importedLogo = subscription.logoUrl?.startsWith('/static/logos/')
      ? await importLogoFromAsset(input.importToken, subscription.id, manifest, logoAssets)
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

  if (subscriptionTagRows.length > 0) {
    await prisma.subscriptionTag.createMany({
      data: subscriptionTagRows
    })
  }

  for (const record of manifest.data.paymentRecords) {
    if (input.mode === 'append' && existingPaymentRecordIds.has(record.id)) {
      skippedPaymentRecords += 1
      continue
    }

    await prisma.paymentRecord.create({
      data: {
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
      }
    })
    importedPaymentRecords += 1
  }

  if (input.mode === 'replace') {
    await setSubscriptionOrder(manifest.data.subscriptionOrder.filter((id) => importedIds.has(id)))
    await restoreSettingsFromBackup(manifest.data.settings)
    await restoreWebhookFromBackup(manifest.data.notificationWebhook)
  } else {
    const mergedOrder = mergeSubscriptionOrder(await getSubscriptionOrder(), manifest.data.subscriptionOrder, importedIds)
    await setSubscriptionOrder(mergedOrder)

    if (input.restoreSettings) {
      await restoreSettingsFromBackup(manifest.data.settings)
      await restoreWebhookFromBackup(manifest.data.notificationWebhook)
    }
  }

  return {
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
    warnings: preview.warnings
  }
}
