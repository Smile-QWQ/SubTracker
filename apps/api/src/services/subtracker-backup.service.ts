import crypto from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import type { Prisma } from '@prisma/client'
import type {
  AppLocale,
  NotificationWebhookSettingsInput,
  PaymentRecordDto,
  SettingsInput,
  SubtrackerBackupAssetLogoDto,
  SubtrackerBackupAssetImageDto,
  SubtrackerBackupCommitInput,
  SubtrackerBackupCommitResultDto,
  SubtrackerBackupInspectConflictsDto,
  SubtrackerBackupInspectResultDto,
  SubtrackerBackupSubscriptionDto,
  SubtrackerBackupTagDto,
} from '@subtracker/shared'
import { DEFAULT_APP_LOCALE, SettingsSchema, NotificationWebhookSettingsSchema, getMessage, LOGO_MIME_BY_EXTENSION } from '@subtracker/shared'
import { prisma } from '../db'
import { formatDateInTimezone, parseDateInTimezone, toTimezonedDayjs } from '../utils/timezone'
import { getLocalLogoLibrary, getLogoStorageDir, saveImportedLogoBuffer } from './logo.service'
import { getAppSettings, setSetting } from './settings.service'
import { getSubscriptionImageStorageDir, writeSubscriptionImageFile, removeSubscriptionImageFiles } from './subscription-images.service'
import { inspectDownloadedImage } from '../utils/remote-image'
import { BoundedZipReader, createZipStream, describeZipSource, ZIP_ASSET_LIMIT, ZIP_MANIFEST_LIMIT, ZIP_ENTRY_LIMIT, BackupLimitError, type ZipSourceFile } from '../utils/streaming-zip'
import { BACKUP_PREVIEW_TTL_MS, cleanupAbandonedBackupFiles, disposeBackupUpload, getBackupLimits, saveBackupUpload, type BackupUpload } from './backup-files.service'
import { getSubscriptionOrder, setSubscriptionOrder } from './subscription-order.service'
import { normalizeTagIds } from './tag.service'
import { getPrimaryWebhookEndpoint } from './webhook.service'

const BACKUP_SCHEMA_VERSION = 2
const IMAGE_MAX_BYTES = ZIP_ASSET_LIMIT
const BACKUP_APP_NAME = 'SubTracker'
const BACKUP_SCOPE = 'business-complete' as const
const MANIFEST_ENTRY = 'manifest.json'
const LOGO_ENTRY_PREFIX = 'logos/'
const IMAGE_ENTRY_PREFIX = 'subscription-images/'
const EXCLUDED_SETTING_KEYS = new Set([
  'authCredentials',
  'authSessionSecret'
])

type BackupManifest = {
  schemaVersion: number
  exportedAt: string
  app: typeof BACKUP_APP_NAME
  scope: typeof BACKUP_SCOPE
  includesSubscriptionImages?: boolean
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
    subscriptionImages?: SubtrackerBackupAssetImageDto[]
  }
}

type CachedImportEntry = {
  expiresAt: number
  owner: string
  upload: BackupUpload
  preview: SubtrackerBackupInspectResultDto
}

type ExistingIdRow = { id: string }
type BackupTagRow = { id: string; name: string; color: string; icon: string; sortOrder: number }
type BackupSubscriptionTagRow = { tagId: string }
type BackupSubscriptionRow = {
  id: string
  name: string
  description: string
  websiteUrl: string | null
  logoUrl: string | null
  logoSource: string | null
  logoFetchedAt: Date | null
  billingType?: SubtrackerBackupSubscriptionDto['billingType']
  status: SubtrackerBackupSubscriptionDto['status']
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: SubtrackerBackupSubscriptionDto['billingIntervalUnit']
  autoRenew: boolean
  startDate: Date
  nextRenewalDate: Date
  notifyDaysBefore: number
  advanceReminderRules: string | null
  overdueReminderRules: string | null
  webhookEnabled: boolean
  notes: string
  createdAt: Date
  updatedAt: Date
  tags: BackupSubscriptionTagRow[]
}
type BackupImageRow = {
  id: string
  subscriptionId: string | null
  fileName: string
  storageName: string
  contentType: string
  size: number
  createdAt: Date
}
type BackupPaymentRecordRow = {
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
}

const previewCache = new Map<string, CachedImportEntry>()

export async function cleanupExpiredImports() {
  for (const [token, entry] of previewCache) {
    if (entry.expiresAt <= Date.now()) {
      previewCache.delete(token)
      await disposeBackupUpload(entry.upload)
    }
  }
  await cleanupAbandonedBackupFiles()
}

export async function discardSubtrackerBackup(importToken: string, owner = '') {
  const entry = previewCache.get(importToken)
  if (!entry || entry.owner !== owner) return
  previewCache.delete(importToken)
  await disposeBackupUpload(entry.upload)
}

export class BackupBusyError extends Error {}
let operationActive = false
function claimOperation() {
  if (operationActive) throw new BackupBusyError('Another backup operation is running')
  operationActive = true
}

function fileTypeFromName(filename: string) {
  return LOGO_MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

function createImportToken() {
  return crypto.randomBytes(24).toString('hex')
}

function buildBackupFileName(timezone: string, now = new Date()) {
  const stamp = toTimezonedDayjs(now, timezone).format('YYYY-MM-DDTHH-mm-ss')
  return `subtracker-backup-${stamp}.zip`
}

async function readLocalLogoAssets(subscriptions: SubtrackerBackupSubscriptionDto[]) {
  const logoDir = getLogoStorageDir()
  const assets: SubtrackerBackupAssetLogoDto[] = []
  const files: ZipSourceFile[] = []
  const libraryItems = await getLocalLogoLibrary()
  const candidateLogoUrls = new Set([
    ...subscriptions.map(item => item.logoUrl ?? '').filter(item => item.startsWith('/static/logos/')),
    ...libraryItems.map((item) => item.logoUrl).filter((item): item is string => Boolean(item?.startsWith('/static/logos/')))
  ])

  for (const logoUrl of candidateLogoUrls) {
    const filename = path.basename(logoUrl)
    if (!filename) continue
    const absolutePath = path.join(logoDir, filename)
    const zipPath = `${LOGO_ENTRY_PREFIX}${filename}`
    const file = await describeZipSource(absolutePath, zipPath)
    files.push(file)
    assets.push({
      path: zipPath,
      filename,
      sourceLogoUrl: logoUrl,
      contentType: fileTypeFromName(filename),
      referencedBySubscriptionIds: []
    })
  }

  return { assets, files }
}

async function readSubscriptionImageAssets() {
  const images: BackupImageRow[] = await prisma.subscriptionImage.findMany({
    where: { subscriptionId: { not: null } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  })
  const assets: SubtrackerBackupAssetImageDto[] = []
  const files: ZipSourceFile[] = []
  for (const image of images) {
    if (!image.subscriptionId) continue
    if (!/^[\w-]+\.[a-z0-9]+$/i.test(image.storageName)) {
      throw new Error('Invalid stored subscription image name')
    }
    const zipPath = `${IMAGE_ENTRY_PREFIX}${image.storageName}`
    const file = await describeZipSource(path.join(getSubscriptionImageStorageDir(), image.storageName), zipPath)
    if (file.size !== image.size) throw new Error('Invalid stored subscription image size')
    files.push(file)
    assets.push({
      id: image.id,
      subscriptionId: image.subscriptionId,
      path: zipPath,
      fileName: image.fileName,
      contentType: image.contentType,
      size: image.size,
      createdAt: image.createdAt.toISOString()
    })
  }
  return { assets, files }
}

async function buildBackupManifest(includeSubscriptionImages = true) {
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

  const serializedSubscriptions: SubtrackerBackupSubscriptionDto[] = subscriptions.map((subscription: BackupSubscriptionRow) => ({
    id: subscription.id,
    name: subscription.name,
    description: subscription.description,
    websiteUrl: subscription.websiteUrl ?? null,
    logoUrl: subscription.logoUrl ?? null,
    logoSource: subscription.logoSource ?? null,
    logoFetchedAt: subscription.logoFetchedAt ? subscription.logoFetchedAt.toISOString() : null,
    billingType: subscription.billingType ?? 'recurring',
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
    tagIds: subscription.tags.map((item: BackupSubscriptionTagRow) => item.tagId),
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString()
  }))

  const serializedTags: SubtrackerBackupTagDto[] = tags.map((tag: BackupTagRow) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    icon: tag.icon,
    sortOrder: tag.sortOrder
  }))

  const serializedPaymentRecords: PaymentRecordDto[] = paymentRecords.map((record: BackupPaymentRecordRow) => ({
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

  const { assets, files } = await readLocalLogoAssets(serializedSubscriptions)

  for (const asset of assets) {
    asset.referencedBySubscriptionIds = serializedSubscriptions
      .filter((subscription) => subscription.logoUrl === asset.sourceLogoUrl)
      .map((subscription) => subscription.id)
  }

  const imageAssets = includeSubscriptionImages ? await readSubscriptionImageAssets() : { assets: [], files: [] }
  const manifest: BackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: BACKUP_APP_NAME,
    scope: BACKUP_SCOPE,
    includesSubscriptionImages: includeSubscriptionImages,
    data: {
      settings: SettingsSchema.parse(settings),
      notificationWebhook: webhookSettings,
      tags: serializedTags,
      subscriptions: serializedSubscriptions,
      paymentRecords: serializedPaymentRecords,
      subscriptionOrder
    },
    assets: {
      logos: assets,
      subscriptionImages: imageAssets.assets
    }
  }

  return {
    manifest,
    files: [...files, ...imageAssets.files]
  }
}

export async function prepareSubtrackerBackupArchive(includeSubscriptionImages = true) {
  const { manifest, files } = await buildBackupManifest(includeSubscriptionImages)
  const data = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  const limits = getBackupLimits()
  const expanded = files.reduce((sum, file) => sum + file.size, data.length)
  // Conservative ZIP header allowance rejects oversized downloads before sending headers.
  const archiveBound = expanded + 1024 + files.reduce((sum, file) => sum + 256 + 2 * Buffer.byteLength(file.path), 0)
  if (data.length > ZIP_MANIFEST_LIMIT || files.length + 1 > ZIP_ENTRY_LIMIT || expanded > limits.maxExpandedBytes || archiveBound > limits.maxArchiveBytes) {
    throw new BackupLimitError('Backup size limit exceeded')
  }
  const suffix = includeSubscriptionImages ? '.zip' : '-without-images.zip'
  const filename = buildBackupFileName(manifest.data.settings.timezone).replace('.zip', suffix)
  return { filename, contentType: 'application/zip', openStream: () => createZipStream(data, files, limits) }
}

export async function createSubtrackerBackupArchive(includeSubscriptionImages = true) {
  const archive = await prepareSubtrackerBackupArchive(includeSubscriptionImages)
  return { filename: archive.filename, contentType: archive.contentType, stream: archive.openStream() }
}

function parseBackupManifest(raw: unknown, locale: AppLocale = DEFAULT_APP_LOCALE): BackupManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupManifestInvalid'))
  }

  const manifest = raw as BackupManifest
  if (manifest.app !== BACKUP_APP_NAME) {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupInvalidFile'))
  }
  if (![1, BACKUP_SCHEMA_VERSION].includes(manifest.schemaVersion)) {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupUnsupportedVersion', { version: manifest.schemaVersion }))
  }
  if (manifest.scope !== BACKUP_SCOPE) {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupUnsupportedScope', { scope: manifest.scope }))
  }
  if (!manifest.data || !manifest.assets || !Array.isArray(manifest.data.subscriptions) ||
      !Array.isArray(manifest.data.tags) || !Array.isArray(manifest.data.paymentRecords) ||
      !Array.isArray(manifest.data.subscriptionOrder) || !Array.isArray(manifest.assets.logos) ||
      (manifest.assets.subscriptionImages !== undefined && !Array.isArray(manifest.assets.subscriptionImages))) {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupManifestMissingData'))
  }

  if (manifest.data.subscriptions.some((item) => item.billingType !== undefined && item.billingType !== 'recurring' && item.billingType !== 'lifetime')) {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupManifestInvalid'))
  }

  if (manifest.includesSubscriptionImages !== undefined && typeof manifest.includesSubscriptionImages !== 'boolean') {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupManifestInvalid'))
  }
  if (manifest.includesSubscriptionImages === false && manifest.assets.subscriptionImages?.length) {
    throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupManifestInvalid'))
  }
  // Strip unknown settings so a business backup cannot overwrite login credentials.
  manifest.data.settings = SettingsSchema.parse(manifest.data.settings)
  manifest.data.notificationWebhook = NotificationWebhookSettingsSchema.parse(manifest.data.notificationWebhook)
  return manifest
}

async function decodeBackupArchive(upload: BackupUpload, locale: AppLocale = DEFAULT_APP_LOCALE, signal?: AbortSignal) {
  const reader = await BoundedZipReader.open(upload.filename, getBackupLimits().maxExpandedBytes, signal)
  try {
    if (!reader.entries.has(MANIFEST_ENTRY)) throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupMissingManifest'))
    const manifest = parseBackupManifest(JSON.parse((await reader.read(MANIFEST_ENTRY, ZIP_MANIFEST_LIMIT)).toString('utf8')), locale)
    const consumed = new Set([MANIFEST_ENTRY])
    for (const asset of manifest.assets.logos) {
      if (!asset || typeof asset.path !== 'string' || !/^logos\/[^/\\]+$/.test(asset.path) || consumed.has(asset.path) ||
          !Object.values(LOGO_MIME_BY_EXTENSION).includes(asset.contentType as never) || !Array.isArray(asset.referencedBySubscriptionIds)) {
        throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupManifestInvalid'))
      }
      const entry = reader.entries.get(asset.path)
      if (!entry || entry.uncompressedSize === 0) throw new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupMissingLogo', { path: asset.path }))
      await reader.consume(asset.path, ZIP_ASSET_LIMIT)
      consumed.add(asset.path)
    }

    const imageIds = new Set<string>()
    const imageCounts = new Map<string, number>()
    const subscriptionIds = new Set(manifest.data.subscriptions.map(item => item.id))
    const invalidImage = () => new Error(getMessage(locale, 'api.errors.imports.subtrackerBackupInvalidImage'))
    for (const asset of manifest.assets.subscriptionImages ?? []) {
      if (!asset || typeof asset.id !== 'string' || !/^[\w-]{1,128}$/.test(asset.id) || imageIds.has(asset.id) ||
          !subscriptionIds.has(asset.subscriptionId) || typeof asset.path !== 'string' ||
          !/^subscription-images\/[\w-]+\.[a-z0-9]+$/i.test(asset.path) || consumed.has(asset.path) ||
          typeof asset.fileName !== 'string' || !asset.fileName.trim() || asset.fileName.length > 255 ||
          typeof asset.contentType !== 'string' || !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > IMAGE_MAX_BYTES ||
          typeof asset.createdAt !== 'string' || !Number.isFinite(Date.parse(asset.createdAt))) throw invalidImage()
      const count = (imageCounts.get(asset.subscriptionId) ?? 0) + 1
      if (count > 20) throw invalidImage()
      imageCounts.set(asset.subscriptionId, count)
      imageIds.add(asset.id)
      if (reader.entries.get(asset.path)?.uncompressedSize !== asset.size) throw invalidImage()
      const data = await reader.read(asset.path, IMAGE_MAX_BYTES)
      try {
        if (inspectDownloadedImage(data, '', { maxBytes: IMAGE_MAX_BYTES }).contentType !== asset.contentType) throw invalidImage()
      } catch {
        throw invalidImage()
      }
      consumed.add(asset.path)
    }
    // Validate even unreferenced entries before any destructive restore, without retaining their bytes.
    for (const [name, entry] of reader.entries) {
      if (!consumed.has(name)) await reader.consume(name, entry.uncompressedSize)
    }
    return { manifest, reader }
  } catch (error) {
    reader.close()
    throw error
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

function buildBackupWarnings(manifest: BackupManifest, locale: AppLocale = DEFAULT_APP_LOCALE) {
  const warnings: string[] = []

  if (manifest.assets.logos.length === 0) {
    warnings.push(getMessage(locale, 'api.errors.subtrackerBackupWarnings.noLocalLogos'))
  }

  if (manifest.data.paymentRecords.length === 0) {
    warnings.push(getMessage(locale, 'api.errors.subtrackerBackupWarnings.noPaymentRecords'))
  }

  if (manifest.includesSubscriptionImages === false) warnings.push(getMessage(locale, 'api.errors.subtrackerBackupWarnings.withoutImages'))
  warnings.push(getMessage(locale, 'api.errors.subtrackerBackupWarnings.excludedSecretsAndHistory'))
  warnings.push(getMessage(locale, 'api.errors.subtrackerBackupWarnings.appendModeDedup'))

  return warnings
}

export async function inspectSubtrackerBackupFile(
  source: Readable,
  locale: AppLocale = DEFAULT_APP_LOCALE,
  owner = '',
  signal?: AbortSignal
): Promise<SubtrackerBackupInspectResultDto> {
  claimOperation()
  let upload: BackupUpload | undefined
  try {
    await cleanupExpiredImports()
    if (previewCache.size >= 2) throw new BackupBusyError('Too many pending backup previews')
    upload = await saveBackupUpload(source)
    signal?.throwIfAborted()
    const { manifest, reader } = await decodeBackupArchive(upload, locale, signal)
    reader.close()
    const conflicts = await buildInspectConflicts(manifest)
    signal?.throwIfAborted()
    const preview: SubtrackerBackupInspectResultDto = {
      isSubtrackerBackup: true,
      summary: {
        scope: BACKUP_SCOPE,
        subscriptionsTotal: manifest.data.subscriptions.length,
        tagsTotal: manifest.data.tags.length,
        paymentRecordsTotal: manifest.data.paymentRecords.length,
        logosTotal: manifest.assets.logos.length,
        subscriptionImagesTotal: manifest.assets.subscriptionImages?.length ?? 0,
        includesSubscriptionImages: manifest.includesSubscriptionImages !== false,
        includesSettings: true
      },
      warnings: buildBackupWarnings(manifest, locale),
      importToken: createImportToken(),
      availableModes: ['replace', 'append'],
      conflicts
    }
    previewCache.set(preview.importToken, { expiresAt: Date.now() + BACKUP_PREVIEW_TTL_MS, owner, upload, preview })
    return preview
  } catch (error) {
    if (upload) await disposeBackupUpload(upload)
    throw error
  } finally {
    operationActive = false
  }
}

export async function disposeSubtrackerBackups() {
  for (const [token, entry] of previewCache) await discardSubtrackerBackup(token, entry.owner)
}

async function clearBusinessData(tx: Prisma.TransactionClient) {
  const imageRows = await tx.subscriptionImage.findMany({ select: { storageName: true } })
  await tx.subscriptionImage.deleteMany()
  await tx.paymentRecord.deleteMany()
  await tx.subscriptionTag.deleteMany()
  await tx.subscription.deleteMany()
  await tx.tag.deleteMany()
  await tx.setting.deleteMany({
    where: {
      key: {
        notIn: Array.from(EXCLUDED_SETTING_KEYS)
      }
    }
  })

  return imageRows.map(image => image.storageName)
}

async function restoreSettingsFromBackup(settings: BackupManifest['data']['settings'], tx: Prisma.TransactionClient) {
  await Promise.all(Object.entries(settings).filter(([key]) => !EXCLUDED_SETTING_KEYS.has(key)).map(([key, value]) => setSetting(key, value, tx)))
}

async function buildTagRestoreMap(manifest: BackupManifest, tx: Prisma.TransactionClient) {
  const existingByName = new Map<string, BackupTagRow>(
    (
      await tx.tag.findMany({
        where: {
          name: {
            in: manifest.data.tags.map((tag) => tag.name)
          }
        }
      })
    ).map((tag: BackupTagRow) => [tag.name, tag] as const)
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

    await tx.tag.create({
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

export async function commitSubtrackerBackup(
  input: SubtrackerBackupCommitInput,
  locale: AppLocale = DEFAULT_APP_LOCALE,
  owner = ''
): Promise<SubtrackerBackupCommitResultDto> {
  claimOperation()
  let cached: CachedImportEntry | undefined
  let reader: BoundedZipReader | undefined
  let committed = false
  const newImageNames: string[] = []
  const newLogoNames: string[] = []
  try {
    await cleanupExpiredImports()
    const candidate = previewCache.get(input.importToken)
    if (!candidate || candidate.owner !== owner) throw new Error(getMessage(locale, 'api.errors.imports.importTokenInvalid'))
    cached = candidate
    previewCache.delete(input.importToken)
    // Recheck the complete on-disk archive before staging files or changing business data.
    const decoded = await decodeBackupArchive(cached.upload, locale)
    reader = decoded.reader
    const { manifest } = decoded
    const appTimezone = manifest.data.settings.timezone
    const existingSubscriptionIds = new Set(input.mode === 'append'
      ? (await prisma.subscription.findMany({ where: { id: { in: manifest.data.subscriptions.map(item => item.id) } }, select: { id: true } })).map(item => item.id)
      : [])
    const oldLogoNames = input.mode === 'replace'
      ? await readdir(getLogoStorageDir()).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
      : []
    type RestoredLogo = Awaited<ReturnType<typeof saveImportedLogoBuffer>>
    type RestoredImage = { fileName: string; storageName: string; contentType: string; size: number; createdAt: Date }
    const logosBySubscription = new Map<string, RestoredLogo>()
    const imagesBySubscription = new Map<string, RestoredImage[]>()
    // Stage original bytes under new generated filenames outside the database transaction.
    for (const asset of manifest.assets.logos) {
      if (input.mode === 'append' && asset.referencedBySubscriptionIds.length && asset.referencedBySubscriptionIds.every(id => existingSubscriptionIds.has(id))) continue
      const logo = await saveImportedLogoBuffer(await reader.read(asset.path, ZIP_ASSET_LIMIT), asset.contentType, 'backup-zip', locale)
      newLogoNames.push(path.basename(logo.logoUrl))
      for (const id of asset.referencedBySubscriptionIds) logosBySubscription.set(id, logo)
    }
    for (const asset of manifest.assets.subscriptionImages ?? []) {
      if (existingSubscriptionIds.has(asset.subscriptionId)) continue
      const bytes = await reader.read(asset.path, IMAGE_MAX_BYTES)
      const storageName = await writeSubscriptionImageFile(bytes, asset.contentType)
      newImageNames.push(storageName)
      const images = imagesBySubscription.get(asset.subscriptionId) ?? []
      images.push({ fileName: asset.fileName, storageName, contentType: asset.contentType, size: bytes.length, createdAt: new Date(asset.createdAt) })
      imagesBySubscription.set(asset.subscriptionId, images)
    }
    reader.close()
    reader = undefined
    let oldImageNames: string[] = []
    const result = await prisma.$transaction(async tx => {
      if (input.mode === 'replace') oldImageNames = await clearBusinessData(tx)
      const { tagIdMap, importedTags, reusedTags } = await buildTagRestoreMap(manifest, tx)
      const incomingPaymentSubscriptionIds = Array.from(new Set(manifest.data.paymentRecords.map(item => item.subscriptionId)))
      const existingPayments = input.mode === 'append' && incomingPaymentSubscriptionIds.length
        ? await tx.paymentRecord.findMany({ where: { subscriptionId: { in: incomingPaymentSubscriptionIds } }, select: { id: true } })
        : []
      const existingPaymentIds = new Set(existingPayments.map(item => item.id))
      const importedSubscriptionIds = new Set<string>()
      const subscriptionTagRows: Array<{ subscriptionId: string; tagId: string }> = []
      let skippedSubscriptions = 0
      for (const subscription of manifest.data.subscriptions) {
        if (existingSubscriptionIds.has(subscription.id)) { skippedSubscriptions += 1; continue }
        const importedLogo = subscription.logoUrl?.startsWith('/static/logos/') ? logosBySubscription.get(subscription.id) : undefined
        const images = imagesBySubscription.get(subscription.id) ?? []
        await tx.subscription.create({ data: {
          id: subscription.id,
          name: subscription.name,
          description: subscription.description,
          websiteUrl: subscription.websiteUrl,
          logoUrl: importedLogo?.logoUrl ?? subscription.logoUrl,
          logoSource: importedLogo?.logoSource ?? subscription.logoSource,
          logoFetchedAt: importedLogo ? new Date() : subscription.logoFetchedAt ? new Date(subscription.logoFetchedAt) : null,
          billingType: subscription.billingType ?? 'recurring',
          status: subscription.billingType === 'lifetime' && subscription.status === 'expired' ? 'active' : subscription.status,
          amount: subscription.amount,
          currency: subscription.currency,
          billingIntervalCount: subscription.billingIntervalCount,
          billingIntervalUnit: subscription.billingIntervalUnit,
          autoRenew: subscription.billingType === 'lifetime' ? false : subscription.autoRenew,
          startDate: parseDateInTimezone(subscription.startDate, appTimezone),
          nextRenewalDate: parseDateInTimezone(subscription.billingType === 'lifetime' ? subscription.startDate : subscription.nextRenewalDate, appTimezone),
          notifyDaysBefore: subscription.notifyDaysBefore,
          advanceReminderRules: subscription.advanceReminderRules,
          overdueReminderRules: subscription.overdueReminderRules,
          webhookEnabled: subscription.billingType === 'lifetime' ? false : subscription.webhookEnabled,
          notes: subscription.notes,
          createdAt: new Date(subscription.createdAt),
          updatedAt: new Date(subscription.updatedAt),
          ...(images.length ? { images: { create: images } } : {})
        } })
        for (const tagId of normalizeTagIds(subscription.tagIds.map(id => tagIdMap.get(id)).filter((value): value is string => Boolean(value)))) {
          subscriptionTagRows.push({ subscriptionId: subscription.id, tagId })
        }
        importedSubscriptionIds.add(subscription.id)
      }
      if (subscriptionTagRows.length) await tx.subscriptionTag.createMany({ data: subscriptionTagRows })
      const payments = manifest.data.paymentRecords.filter(record => !existingPaymentIds.has(record.id))
      if (payments.length) await tx.paymentRecord.createMany({ data: toPaymentRecordCreateManyInput(payments) })
      if (input.mode === 'replace') {
        await setSubscriptionOrder(manifest.data.subscriptionOrder.filter(id => importedSubscriptionIds.has(id)), tx)
      } else if (importedSubscriptionIds.size) {
        const order = new Set(await getSubscriptionOrder(tx))
        for (const id of manifest.data.subscriptionOrder) if (importedSubscriptionIds.has(id)) order.add(id)
        await setSubscriptionOrder(Array.from(order), tx)
      }
      if (input.mode === 'replace' || input.restoreSettings) {
        await restoreSettingsFromBackup(manifest.data.settings, tx)
        await setSetting('notificationWebhook', manifest.data.notificationWebhook, tx)
      }
      return {
        mode: input.mode, clearedExistingData: input.mode === 'replace', restoredSettings: input.mode === 'replace' || input.restoreSettings,
        importedTags, reusedTags, importedSubscriptions: importedSubscriptionIds.size, skippedSubscriptions,
        importedPaymentRecords: payments.length, skippedPaymentRecords: manifest.data.paymentRecords.length - payments.length,
        importedLogos: newLogoNames.length, importedSubscriptionImages: newImageNames.length, warnings: cached!.preview.warnings
      }
    }, { maxWait: 10000, timeout: 120000 })
    committed = true
    // Old files remain readable until the complete database transaction succeeds.
    await removeSubscriptionImageFiles(oldImageNames)
    await Promise.allSettled(oldLogoNames.map(name => rm(path.join(getLogoStorageDir(), name), { force: true })))
    return result
  } finally {
    try {
      reader?.close()
      if (!committed) {
        await removeSubscriptionImageFiles(newImageNames)
        await Promise.allSettled(newLogoNames.map(name => rm(path.join(getLogoStorageDir(), name), { force: true })))
      }
    } finally {
      if (cached) await disposeBackupUpload(cached.upload).catch(() => undefined)
      operationActive = false
    }
  }
}
