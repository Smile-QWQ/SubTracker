import crypto from 'node:crypto'
import type {
  BillingIntervalUnit,
  WallosImportCommitInput,
  WallosImportCommitResultDto,
  WallosImportInspectInput,
  WallosImportInspectResultDto,
  WallosImportSubscriptionPreviewDto,
  WallosImportTagDto
} from '@subtracker/shared'
import { prisma } from '../db'
import { getRuntimeD1Database, getWorkerLogoBucket, isWorkerRuntime } from '../runtime'
import { parseDateInTimezone } from '../utils/timezone'
import { appendSubscriptionOrders } from './subscription-order.service'
import { saveImportedLogoBufferToKey } from './logo.service'
import { getAppTimezone } from './settings.service'
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

type ZipLogoManifestEntry = {
  logoRef: string
  r2Key: string
  logoUrl: string
  contentType: string
  uploaded: boolean
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

function ensureUniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings))
}

function basename(input: string) {
  const normalized = input.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || normalized
}

function extname(input: string) {
  const name = basename(input)
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function normalizeZipLogoName(filename: string) {
  return basename(filename).toLowerCase()
}

function buildTemporaryLogoKey(filename: string) {
  const ext = extname(filename) || '.png'
  const base = basename(filename).replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'logo'
  return `logos/imports/wallos/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${base}${ext}`
}

function clonePreparedPreview(input: WallosImportInspectInput['preview'], fileType: WallosImportInspectInput['fileType']): WallosImportInspectResultDto {
  return {
    isWallos: true,
    summary: {
      ...input.summary,
      fileType
    },
    tags: input.tags.map((item: WallosImportTagDto) => ({ ...item })),
    usedTags: input.usedTags.map((item: WallosImportTagDto) => ({ ...item })),
    subscriptionsPreview: input.subscriptionsPreview.map((item: WallosImportSubscriptionPreviewDto) => ({
      ...item,
      tagNames: [...item.tagNames],
      warnings: [...item.warnings]
    })),
    warnings: [...input.warnings]
  }
}

async function uploadPreparedLogoManifest(
  preview: WallosImportInspectResultDto,
  logoAssets: WallosImportInspectInput['logoAssets']
) {
  const manifest: Record<string, ZipLogoManifestEntry> = {}
  if (preview.summary.fileType !== 'zip' || !logoAssets.length) {
    return manifest
  }

  if (!getWorkerLogoBucket()) {
    if (preview.summary.zipLogoMatched > 0) {
      preview.warnings = ensureUniqueWarnings([
        ...preview.warnings,
        `当前 Worker 未启用 R2，已忽略 ${preview.summary.zipLogoMatched} 个 ZIP Logo`
      ])
      preview.subscriptionsPreview = preview.subscriptionsPreview.map((item) =>
        item.logoImportStatus === 'ready-from-zip'
          ? {
              ...item,
              logoRef: null,
              logoImportStatus: 'none'
            }
          : item
      )
    }
    return manifest
  }

  const assetByRef = new Map(logoAssets.map((item) => [normalizeZipLogoName(item.logoRef), item]))
  const readyRefs = new Set(
    preview.subscriptionsPreview
      .filter((item) => item.logoImportStatus === 'ready-from-zip' && item.logoRef)
      .map((item) => normalizeZipLogoName(String(item.logoRef)))
  )

  for (const logoRef of readyRefs) {
    const asset = assetByRef.get(logoRef)
    if (!asset) {
      preview.warnings = ensureUniqueWarnings([...preview.warnings, `ZIP Logo ${logoRef} 缺少前端上传内容，已忽略`])
      preview.subscriptionsPreview = preview.subscriptionsPreview.map((item) =>
        item.logoRef && normalizeZipLogoName(item.logoRef) === logoRef
          ? {
              ...item,
              logoRef: null,
              logoImportStatus: 'none',
              warnings: [...item.warnings, 'ZIP Logo 文件未随预览一起上传，已忽略']
            }
          : item
      )
      continue
    }

    const buffer = Buffer.from(asset.base64, 'base64')
    if (!buffer.length) continue

    const r2Key = buildTemporaryLogoKey(asset.filename)
    const stored = await saveImportedLogoBufferToKey(buffer, asset.contentType, r2Key, 'wallos-zip')
    manifest[logoRef] = {
      logoRef: asset.filename,
      r2Key,
      logoUrl: stored.logoUrl,
      contentType: asset.contentType,
      uploaded: true
    }
  }

  return manifest
}

function toSqlBoolean(value: boolean) {
  return value ? 1 : 0
}

function toSqlDateTime(value: Date | null) {
  return value ? value.toISOString() : null
}

async function runD1StatementBatch(
  statements: Array<ReturnType<ReturnType<typeof getRuntimeD1Database>['prepare']>>,
  chunkSize = 50
) {
  if (!statements.length) return
  const db = getRuntimeD1Database()

  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize)
    if (db.batch) {
      await db.batch(chunk)
      continue
    }

    for (const statement of chunk) {
      await statement.run()
    }
  }
}

export async function inspectWallosImportFile(input: WallosImportInspectInput): Promise<WallosImportInspectResultDto> {
  const preview = clonePreparedPreview(input.preview, input.fileType)
  if (!getWorkerLogoBucket() && preview.summary.fileType === 'zip' && preview.summary.zipLogoMatched > 0) {
    preview.warnings = ensureUniqueWarnings([
      ...preview.warnings,
      `当前 Worker 未启用 R2，已忽略 ${preview.summary.zipLogoMatched} 个 ZIP Logo`
    ])
    preview.subscriptionsPreview = preview.subscriptionsPreview.map((item) =>
      item.logoImportStatus === 'ready-from-zip'
        ? {
            ...item,
            logoRef: null,
            logoImportStatus: 'none'
          }
        : item
    )
  }

  if (preview.summary.fileType === 'zip' && input.logoAssets.length > 0) {
    const availableRefs = new Set(input.logoAssets.map((item) => normalizeZipLogoName(item.logoRef)))
    for (const item of preview.subscriptionsPreview) {
      if (item.logoImportStatus === 'ready-from-zip' && item.logoRef && !availableRefs.has(normalizeZipLogoName(item.logoRef))) {
        item.logoRef = null
        item.logoImportStatus = 'none'
        item.warnings = [...item.warnings, 'ZIP Logo 文件未随预览一起上传，已忽略']
      }
    }
  }

  return preview
}

export async function commitWallosImport(input: WallosImportCommitInput): Promise<WallosImportCommitResultDto> {
  const preview = clonePreparedPreview(input.preview, input.fileType)
  const logoManifest = await uploadPreparedLogoManifest(preview, input.logoAssets)
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
    if (isWorkerRuntime()) {
      const db = getRuntimeD1Database()
      const preparedTags = missingTags.map((tag) => ({
        id: createImportId(),
        name: tag.name,
        color: getImportedTagColor(tag.name),
        sortOrder: tag.sortOrder
      }))

      await runD1StatementBatch(
        preparedTags.map((tag) =>
          db
            .prepare(`INSERT INTO "Tag" ("id", "name", "color", "sortOrder") VALUES (?, ?, ?, ?)`)
            .bind(tag.id, tag.name, tag.color, tag.sortOrder)
        )
      )
    } else {
      await prisma.tag.createMany({
        data: missingTags.map((tag) => ({
          name: tag.name,
          color: getImportedTagColor(tag.name),
          sortOrder: tag.sortOrder
        }))
      })
    }
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
    status: WallosImportSubscriptionPreviewDto['status']
  }> = []
  const subscriptionTagRows: Array<{ subscriptionId: string; tagId: string }> = []

  for (const item of preview.subscriptionsPreview) {
    const tagIds = item.tagNames.map((name) => tagIdByName.get(name)).filter((value): value is string => Boolean(value))

    const normalizedLogoRef = item.logoRef ? normalizeZipLogoName(item.logoRef) : null
    const manifestEntry = normalizedLogoRef ? logoManifest[normalizedLogoRef] : null
    const hasImportedLogo = Boolean(manifestEntry?.uploaded && manifestEntry.logoUrl)
    if (hasImportedLogo) {
      importedLogos += 1
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
      logoUrl: manifestEntry?.logoUrl ?? null,
      logoSource: manifestEntry?.uploaded ? 'wallos-zip' : null,
      logoFetchedAt: manifestEntry?.uploaded ? new Date() : null,
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
    if (isWorkerRuntime()) {
      const db = getRuntimeD1Database()
      await runD1StatementBatch(
        subscriptionRows.map((row) =>
          db
            .prepare(
              `INSERT INTO "Subscription" (
                "id", "name", "description", "websiteUrl", "logoUrl", "logoSource", "logoFetchedAt",
                "status", "amount", "currency", "billingIntervalCount", "billingIntervalUnit",
                "autoRenew", "startDate", "nextRenewalDate", "notifyDaysBefore",
                "webhookEnabled", "notes"
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              row.id,
              row.name,
              row.description,
              row.websiteUrl,
              row.logoUrl,
              row.logoSource,
              toSqlDateTime(row.logoFetchedAt),
              row.status,
              row.amount,
              row.currency,
              row.billingIntervalCount,
              row.billingIntervalUnit,
              toSqlBoolean(row.autoRenew),
              row.startDate.toISOString(),
              row.nextRenewalDate.toISOString(),
              row.notifyDaysBefore,
              toSqlBoolean(row.webhookEnabled),
              row.notes
            )
        ),
        25
      )
    } else {
      await prisma.subscription.createMany({
        data: subscriptionRows
      })
    }
  }

  if (subscriptionTagRows.length > 0) {
    if (isWorkerRuntime()) {
      const db = getRuntimeD1Database()
      await runD1StatementBatch(
        subscriptionTagRows.map((row) =>
          db
            .prepare(`INSERT INTO "SubscriptionTag" ("subscriptionId", "tagId") VALUES (?, ?)`)
            .bind(row.subscriptionId, row.tagId)
        )
      )
    } else {
      await prisma.subscriptionTag.createMany({
        data: subscriptionTagRows
      })
    }
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
