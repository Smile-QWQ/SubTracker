import crypto from 'node:crypto'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
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
  SubtrackerBackupSubscriptionDto,
  SubtrackerBackupTagDto
} from '@subtracker/shared'
import { SettingsSchema } from '@subtracker/shared'
import { prisma } from '../db'
import { formatDateInTimezone, parseDateInTimezone } from '../utils/timezone'
import { getLocalLogoLibrary, getLogoStorageDir, saveImportedLogoBuffer } from './logo.service'
import { getAppSettings, setSetting } from './settings.service'
import { getSubscriptionOrder, setSubscriptionOrder } from './subscription-order.service'
import { normalizeTagIds } from './tag.service'
import { getPrimaryWebhookEndpoint } from './webhook.service'

const IMPORT_TOKEN_TTL_MS = 15 * 60 * 1000
const BACKUP_SCHEMA_VERSION = 1
const BACKUP_APP_NAME = 'SubTracker'
const BACKUP_SCOPE = 'business-complete' as const
const MANIFEST_ENTRY = 'manifest.json'
const LOGO_ENTRY_PREFIX = 'logos/'
const EXCLUDED_SETTING_KEYS = new Set([
  'authCredentials',
  'authSessionSecret'
])

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
  expiresAt: number
  manifest: BackupManifest
  logoAssets: Map<string, { buffer: Buffer; contentType: string }>
  preview: SubtrackerBackupInspectResultDto
}

const previewCache = new Map<string, CachedImportEntry>()

function cleanupExpiredImports() {
  const now = Date.now()
  for (const [token, entry] of previewCache.entries()) {
    if (entry.expiresAt <= now) {
      previewCache.delete(token)
    }
  }
}

function fileTypeFromName(filename: string) {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function normalizeZipLogoPath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\/+/, '')
}

function createImportToken() {
  return crypto.randomBytes(24).toString('hex')
}

function buildBackupFileName(now = new Date()) {
  const stamp = now.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  return `subtracker-backup-${stamp}.zip`
}

async function readLocalLogoAssets(logoUrls: string[]) {
  const logoDir = getLogoStorageDir()
  const assets: SubtrackerBackupAssetLogoDto[] = []
  const fileBuffers = new Map<string, Buffer>()
  const libraryItems = await getLocalLogoLibrary()
  const candidateLogoUrls = new Set([
    ...logoUrls.filter((item) => item.startsWith('/static/logos/')),
    ...libraryItems.map((item) => item.logoUrl).filter((item): item is string => Boolean(item?.startsWith('/static/logos/')))
  ])

  for (const logoUrl of candidateLogoUrls) {
    const filename = path.basename(logoUrl)
    if (!filename) continue
    const absolutePath = path.join(logoDir, filename)
    const buffer = await readFile(absolutePath)
    const zipPath = `${LOGO_ENTRY_PREFIX}${filename}`
    assets.push({
      path: zipPath,
      filename,
      sourceLogoUrl: logoUrl,
      contentType: fileTypeFromName(filename),
      referencedBySubscriptionIds: []
    })
    fileBuffers.set(zipPath, buffer)
  }

  return {
    assets,
    fileBuffers
  }
}

async function buildBackupManifest(): Promise<{ manifest: BackupManifest; logoBuffers: Map<string, Buffer> }> {
  const [settings, webhookSettings, tags, subscriptions, paymentRecords, subscriptionOrder] = await Promise.all([
    getAppSettings(),
    getPrimaryWebhookEndpoint(),
    prisma.tag.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    }),
    prisma.subscription.findMany({
      include: {
        tags: true
      },
      orderBy: [{ createdAt: 'asc' }]
    }),
    prisma.paymentRecord.findMany({
      orderBy: [{ createdAt: 'asc' }]
    }),
    getSubscriptionOrder()
  ])

  const serializedSubscriptions: SubtrackerBackupSubscriptionDto[] = subscriptions.map((subscription) => ({
    id: subscription.id,
    name: subscription.name,
    description: subscription.description,
    websiteUrl: subscription.websiteUrl ?? null,
    logoUrl: subscription.logoUrl ?? null,
    logoSource: subscription.logoSource ?? null,
    logoFetchedAt: subscription.logoFetchedAt ? subscription.logoFetchedAt.toISOString() : null,
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    billingIntervalCount: subscription.billingIntervalCount,
    billingIntervalUnit: subscription.billingIntervalUnit,
    autoRenew: subscription.autoRenew,
    startDate: formatDateInTimezone(subscription.startDate, settings.timezone),
    nextRenewalDate: formatDateInTimezone(subscription.nextRenewalDate, settings.timezone),
    notifyDaysBefore: subscription.notifyDaysBefore,
    advanceReminderRules: subscription.advanceReminderRules ?? null,
    overdueReminderRules: subscription.overdueReminderRules ?? null,
    webhookEnabled: subscription.webhookEnabled,
    notes: subscription.notes,
    tagIds: subscription.tags.map((item) => item.tagId),
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString()
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

  const { assets, fileBuffers } = await readLocalLogoAssets(
    serializedSubscriptions.map((item) => item.logoUrl ?? '').filter(Boolean)
  )

  for (const asset of assets) {
    asset.referencedBySubscriptionIds = serializedSubscriptions
      .filter((subscription) => subscription.logoUrl === asset.sourceLogoUrl)
      .map((subscription) => subscription.id)
  }

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
      logos: assets
    }
  }

  return {
    manifest,
    logoBuffers: fileBuffers
  }
}

export async function createSubtrackerBackupArchive() {
  const { manifest, logoBuffers } = await buildBackupManifest()
  const zip = new AdmZip()
  zip.addFile(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))

  for (const [entryName, buffer] of logoBuffers.entries()) {
    zip.addFile(entryName, buffer)
  }

  return {
    filename: buildBackupFileName(),
    contentType: 'application/zip',
    buffer: zip.toBuffer()
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

async function decodeBackupArchive(input: SubtrackerBackupInspectInput) {
  const buffer = Buffer.from(input.base64, 'base64')
  if (!buffer.length) {
    throw new Error('备份文件内容为空')
  }

  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()
  const manifestEntry = entries.find((entry) => !entry.isDirectory && normalizeZipLogoPath(entry.entryName) === MANIFEST_ENTRY)
  if (!manifestEntry) {
    throw new Error('备份 ZIP 缺少 manifest.json')
  }

  const manifest = parseBackupManifest(JSON.parse(manifestEntry.getData().toString('utf8')))
  const logoAssets = new Map<string, { buffer: Buffer; contentType: string }>()

  for (const asset of manifest.assets.logos) {
    const normalizedPath = normalizeZipLogoPath(asset.path)
    const entry = entries.find((item) => !item.isDirectory && normalizeZipLogoPath(item.entryName) === normalizedPath)
    if (!entry) {
      throw new Error(`备份 ZIP 缺少 Logo 文件：${asset.path}`)
    }

    logoAssets.set(normalizedPath, {
      buffer: entry.getData(),
      contentType: asset.contentType
    })
  }

  return {
    manifest,
    logoAssets
  }
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

function buildBackupWarnings(manifest: BackupManifest) {
  const warnings: string[] = []

  if (manifest.assets.logos.length === 0) {
    warnings.push('该备份不包含本地 Logo 文件')
  }

  if (manifest.data.paymentRecords.length === 0) {
    warnings.push('该备份不包含支付记录')
  }

  warnings.push('不会恢复登录凭据、会话密钥、Webhook 历史和汇率快照')
  warnings.push('追加导入时，订阅与支付记录按原始 ID 幂等跳过；同名标签会复用现有标签')

  return warnings
}

export async function inspectSubtrackerBackupFile(input: SubtrackerBackupInspectInput): Promise<SubtrackerBackupInspectResultDto> {
  cleanupExpiredImports()

  const { manifest, logoAssets } = await decodeBackupArchive(input)
  const conflicts = await buildInspectConflicts(manifest)
  const preview: SubtrackerBackupInspectResultDto = {
    isSubtrackerBackup: true,
    summary: {
      scope: BACKUP_SCOPE,
      subscriptionsTotal: manifest.data.subscriptions.length,
      tagsTotal: manifest.data.tags.length,
      paymentRecordsTotal: manifest.data.paymentRecords.length,
      logosTotal: manifest.assets.logos.length,
      includesSettings: true
    },
    warnings: buildBackupWarnings(manifest),
    importToken: createImportToken(),
    availableModes: ['replace', 'append'],
    conflicts
  }

  previewCache.set(preview.importToken, {
    expiresAt: Date.now() + IMPORT_TOKEN_TTL_MS,
    manifest,
    logoAssets,
    preview
  })

  return preview
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

  const logoDir = getLogoStorageDir()
  await mkdir(logoDir, { recursive: true })
  const existingFiles = await readdir(logoDir)
  await Promise.all(existingFiles.map((file) => rm(path.join(logoDir, file), { force: true })))
}

async function restoreSettingsFromBackup(settings: BackupManifest['data']['settings']) {
  await Promise.all(
    Object.entries(settings).map(([key, value]) => setSetting(key, value))
  )
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

async function importLogoFromAsset(
  subscriptionId: string,
  manifest: BackupManifest,
  logoAssets: Map<string, { buffer: Buffer; contentType: string }>
) {
  const asset = manifest.assets.logos.find((item) => item.referencedBySubscriptionIds.includes(subscriptionId))
  if (!asset) return null

  const entry = logoAssets.get(normalizeZipLogoPath(asset.path))
  if (!entry) return null

  return saveImportedLogoBuffer(entry.buffer, entry.contentType, 'backup-zip')
}

export async function commitSubtrackerBackup(input: SubtrackerBackupCommitInput): Promise<SubtrackerBackupCommitResultDto> {
  cleanupExpiredImports()

  const cached = previewCache.get(input.importToken)
  if (!cached || cached.expiresAt <= Date.now()) {
    previewCache.delete(input.importToken)
    throw new Error('导入令牌不存在或已失效，请重新生成预览')
  }
  previewCache.delete(input.importToken)

  const { manifest, logoAssets } = cached
  const appTimezone = manifest.data.settings.timezone

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
  const subscriptionTagRows: Array<{ subscriptionId: string; tagId: string }> = []

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
        logoUrl: importedLogo?.logoUrl ?? subscription.logoUrl,
        logoSource: importedLogo?.logoSource ?? subscription.logoSource,
        logoFetchedAt: importedLogo ? new Date() : subscription.logoFetchedAt ? new Date(subscription.logoFetchedAt) : null,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        billingIntervalCount: subscription.billingIntervalCount,
        billingIntervalUnit: subscription.billingIntervalUnit,
        autoRenew: subscription.autoRenew,
        startDate: parseDateInTimezone(subscription.startDate, appTimezone),
        nextRenewalDate: parseDateInTimezone(subscription.nextRenewalDate, appTimezone),
        notifyDaysBefore: subscription.notifyDaysBefore,
        advanceReminderRules: subscription.advanceReminderRules,
        overdueReminderRules: subscription.overdueReminderRules,
        webhookEnabled: subscription.webhookEnabled,
        notes: subscription.notes,
        createdAt: new Date(subscription.createdAt),
        updatedAt: new Date(subscription.updatedAt)
      }
    })

    for (const tagId of normalizeTagIds(subscription.tagIds.map((tagId) => tagIdMap.get(tagId)).filter((value): value is string => Boolean(value)))) {
      subscriptionTagRows.push({
        subscriptionId: subscription.id,
        tagId
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
    await setSubscriptionOrder(manifest.data.subscriptionOrder.filter((id) => manifest.data.subscriptions.some((item) => item.id === id)))
    await restoreSettingsFromBackup(manifest.data.settings)
    await setSetting('notificationWebhook', manifest.data.notificationWebhook)
  } else {
    const appendOrder = new Set(await getSubscriptionOrder())
    for (const id of manifest.data.subscriptionOrder) {
      if (manifest.data.subscriptions.some((item) => item.id === id) && !appendOrder.has(id)) {
        appendOrder.add(id)
      }
    }
    await setSubscriptionOrder(Array.from(appendOrder))

    if (input.restoreSettings) {
      await restoreSettingsFromBackup(manifest.data.settings)
      await setSetting('notificationWebhook', manifest.data.notificationWebhook)
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
    warnings: cached.preview.warnings
  }
}
