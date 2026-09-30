import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Prisma, SubscriptionImage } from '@prisma/client'
import { LOGO_EXTENSION_BY_MIME, LOGO_MIME_BY_EXTENSION } from '@subtracker/shared'
import { prisma } from '../db'
import { apiRootDir } from '../config'
import { fetchRemoteBody, inspectDownloadedImage, RemoteImageTooLargeError } from '../utils/remote-image'

export const SUBSCRIPTION_IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const SUBSCRIPTION_IMAGE_MAX_COUNT = 20
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000
const sizeOptions = { maxBytes: SUBSCRIPTION_IMAGE_MAX_BYTES }

export class SubscriptionImageError extends Error {
  constructor(readonly key: string, readonly statusCode = 422) {
    super(`api.errors.subscriptionImages.${key}`)
  }
}

export function getSubscriptionImageStorageDir() {
  return path.resolve(process.env.SUBSCRIPTION_IMAGE_STORAGE_DIR || path.join(apiRootDir, 'storage/subscription-images'))
}

function storagePath(storageName: string) {
  // Storage names are generated here, never taken from a user filename or URL.
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|svg|gif|ico|avif|bmp)$/.test(storageName)) {
    throw new SubscriptionImageError('invalidImage')
  }
  return path.join(getSubscriptionImageStorageDir(), storageName)
}

function inspectImage(buffer: Buffer) {
  try {
    return inspectDownloadedImage(buffer, '', sizeOptions)
  } catch (error) {
    throw new SubscriptionImageError(error instanceof RemoteImageTooLargeError ? 'tooLarge' : 'invalidImage',
      error instanceof RemoteImageTooLargeError ? 413 : 422)
  }
}

/** Shared with backup restore: validates bytes/size, but never creates a database row. */
export async function writeSubscriptionImageFile(buffer: Buffer, contentType: string): Promise<string> {
  const actualType = inspectImage(buffer).contentType
  const normalizedType = LOGO_MIME_BY_EXTENSION[LOGO_EXTENSION_BY_MIME[contentType]]
  if (normalizedType !== actualType) throw new SubscriptionImageError('invalidImage')
  const storageName = `${randomUUID()}${LOGO_EXTENSION_BY_MIME[actualType]}`
  await mkdir(getSubscriptionImageStorageDir(), { recursive: true })
  try {
    await writeFile(storagePath(storageName), buffer, { flag: 'wx' })
  } catch (error) {
    // A failed write can leave a partial file; never remove an existing name collision.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await removeSubscriptionImageFiles([storageName])
    throw error
  }
  return storageName
}

/** Called only after the database commit; a missing file must not undo that commit. */
export async function removeSubscriptionImageFiles(storageNames: string[]): Promise<void> {
  await Promise.all(storageNames.map(async (storageName) => {
    try {
      await unlink(storagePath(storageName))
    } catch {
      // Best effort, including already removed files and invalid legacy storage names.
    }
  }))
}

export function subscriptionImageMetadata(image: SubscriptionImage) {
  return {
    id: image.id,
    fileName: image.fileName,
    contentType: image.contentType,
    size: image.size,
    createdAt: image.createdAt.toISOString()
  }
}

function normalizeFileName(fileName: string, contentType: string) {
  const name = fileName.replace(/\\/g, '/').split('/').pop()?.replace(/[\x00-\x1f\x7f]/g, '').trim()
  return name?.slice(0, 255) || `image${LOGO_EXTENSION_BY_MIME[contentType]}`
}

function decodeImageBase64(dataBase64: string) {
  if (dataBase64.length > Math.ceil(SUBSCRIPTION_IMAGE_MAX_BYTES / 3) * 4) {
    throw new SubscriptionImageError('tooLarge', 413)
  }
  // Buffer.from silently accepts malformed input; require a canonical base64 payload.
  if (!dataBase64.length || dataBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(dataBase64)) {
    throw new SubscriptionImageError('invalidImage')
  }
  const buffer = Buffer.from(dataBase64, 'base64')
  if (buffer.toString('base64') !== dataBase64) throw new SubscriptionImageError('invalidImage')
  return buffer
}

async function savePendingImage(buffer: Buffer, fileName: string, contentType: string) {
  const storageName = await writeSubscriptionImageFile(buffer, contentType)
  try {
    const image = await prisma.subscriptionImage.create({
      data: { fileName: normalizeFileName(fileName, contentType), storageName, contentType, size: buffer.length }
    })
    return subscriptionImageMetadata(image)
  } catch (error) {
    await removeSubscriptionImageFiles([storageName])
    throw error
  }
}

/** Claim stale rows transactionally, so attachment/cancellation cannot delete a newly bound file. */
export async function cleanupPendingSubscriptionImages(now = new Date()) {
  const cutoff = new Date(now.getTime() - PENDING_MAX_AGE_MS)
  const storageNames = await prisma.$transaction(async (tx) => {
    const pending = await tx.subscriptionImage.findMany({
      where: { subscriptionId: null, createdAt: { lt: cutoff } },
      select: { id: true, storageName: true }
    })
    const claimed: string[] = []
    for (const image of pending) {
      const result = await tx.subscriptionImage.deleteMany({
        where: { id: image.id, subscriptionId: null, createdAt: { lt: cutoff } }
      })
      if (result.count === 1) claimed.push(image.storageName)
    }
    return claimed
  })
  await removeSubscriptionImageFiles(storageNames)
}

export async function uploadSubscriptionImage(input: {
  fileName: string; contentType: string; dataBase64: string; svgConfirmed?: boolean
}) {
  const buffer = decodeImageBase64(input.dataBase64)
  // A declared MIME (including SVG) is only a hint. Actual bytes decide type and confirmation.
  const { contentType } = inspectImage(buffer)
  if (contentType === 'image/svg+xml' && input.svgConfirmed !== true) {
    throw new SubscriptionImageError('svgConfirmationRequired')
  }
  await cleanupPendingSubscriptionImages()
  return savePendingImage(buffer, input.fileName, contentType)
}

export async function importSubscriptionImage(url: string) {
  let downloaded
  try {
    downloaded = await fetchRemoteBody(url, {}, sizeOptions)
  } catch (error) {
    throw new SubscriptionImageError(error instanceof RemoteImageTooLargeError ? 'tooLarge' : 'importFailed',
      error instanceof RemoteImageTooLargeError ? 413 : 400)
  }
  const { contentType } = inspectImage(downloaded.buffer)
  let urlFileName = new URL(downloaded.finalUrl).pathname.split('/').pop() || ''
  try { urlFileName = decodeURIComponent(urlFileName) } catch { /* Keep a malformed URL segment as text. */ }
  const fileName = normalizeFileName(urlFileName, contentType)
  await cleanupPendingSubscriptionImages()
  if (contentType === 'image/svg+xml') {
    return { requiresConfirmation: true as const, fileName, contentType, dataBase64: downloaded.buffer.toString('base64') }
  }
  return { requiresConfirmation: false as const, image: await savePendingImage(downloaded.buffer, fileName, contentType) }
}

export async function listSubscriptionImages(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true } })
  if (!subscription) throw new SubscriptionImageError('notFound', 404)
  await cleanupPendingSubscriptionImages()
  const images = await prisma.subscriptionImage.findMany({
    where: { subscriptionId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  })
  return images.map(subscriptionImageMetadata)
}

export async function readSubscriptionImage(id: string) {
  const image = await prisma.subscriptionImage.findUnique({ where: { id } })
  if (!image) throw new SubscriptionImageError('notFound', 404)
  let buffer: Buffer
  try {
    buffer = await readFile(storagePath(image.storageName))
  } catch {
    throw new SubscriptionImageError('notFound', 404)
  }
  return { buffer, contentType: inspectImage(buffer).contentType }
}

export async function deletePendingSubscriptionImage(id: string) {
  const storageName = await prisma.$transaction(async (tx) => {
    const image = await tx.subscriptionImage.findUnique({ where: { id } })
    if (!image) throw new SubscriptionImageError('notFound', 404)
    if (image.subscriptionId !== null) throw new SubscriptionImageError('invalidSelection', 409)
    const claimed = await tx.subscriptionImage.deleteMany({ where: { id, subscriptionId: null } })
    if (claimed.count !== 1) throw new SubscriptionImageError('invalidSelection', 409)
    return image.storageName
  })
  await removeSubscriptionImageFiles([storageName])
}

/** Caller owns the subscription transaction and must remove returned files only after commit. */
export async function replaceSubscriptionImages(tx: Prisma.TransactionClient, subscriptionId: string, imageIds: string[]) {
  if (imageIds.length > SUBSCRIPTION_IMAGE_MAX_COUNT) throw new SubscriptionImageError('limitExceeded')
  if (new Set(imageIds).size !== imageIds.length) throw new SubscriptionImageError('invalidSelection')
  if (imageIds.length) {
    // Compare-and-set both claims pending images and rejects cross-subscription/missing selections.
    const claimed = await tx.subscriptionImage.updateMany({
      where: { id: { in: imageIds }, OR: [{ subscriptionId: null }, { subscriptionId }] },
      data: { subscriptionId }
    })
    if (claimed.count !== imageIds.length) throw new SubscriptionImageError('invalidSelection')
  }
  const where = { subscriptionId, id: { notIn: imageIds } }
  const removed = await tx.subscriptionImage.findMany({ where, select: { storageName: true } })
  await tx.subscriptionImage.deleteMany({ where })
  return removed.map((image) => image.storageName)
}

export async function deleteSubscriptionWithImages(id: string) {
  // Prisma's relational delete returns the images in the same operation as the cascade.
  const deleted = await prisma.subscription.delete({
    where: { id }, include: { images: { select: { storageName: true } } }
  })
  await removeSubscriptionImageFiles((deleted.images ?? []).map((image) => image.storageName))
}
