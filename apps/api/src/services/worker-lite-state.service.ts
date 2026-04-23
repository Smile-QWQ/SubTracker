import { Prisma } from '@prisma/client'
import type { WallosImportInspectResultDto, WebhookEventType } from '@subtracker/shared'
import { prisma } from '../db'
import { getRuntimeD1Database, isWorkerRuntime } from '../runtime'

type NotificationChannel = 'email' | 'pushplus' | 'telegram'

type ImportPreviewRow = {
  token: string
  previewJson: unknown
  expiresAt: string
}

function getD1() {
  if (!isWorkerRuntime()) return null
  return getRuntimeD1Database()
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

function createCuidLike() {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const timestamp = Date.now().toString(36).slice(-8)
  return `c${timestamp}${random}`.slice(0, 25)
}

function parseJsonValue<T>(value: unknown) {
  if (value === null || value === undefined) {
    throw new Error('State JSON value is empty')
  }

  if (typeof value === 'object') {
    if (value instanceof Uint8Array) {
      return JSON.parse(new TextDecoder().decode(value)) as T
    }
    if (value instanceof ArrayBuffer) {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(value))) as T
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return JSON.parse(value.toString('utf8')) as T
    }
    return value as T
  }

  return JSON.parse(String(value)) as T
}

function isUniqueConstraintError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002'
  }

  const message = error instanceof Error ? error.message : String(error)
  return /unique/i.test(message)
}

export async function claimNotificationDelivery(params: {
  channel: NotificationChannel
  eventType: WebhookEventType
  resourceKey: string
  periodKey: string
}) {
  if (!getD1()) {
    try {
      await prisma.notificationDelivery.create({
        data: {
          channel: params.channel,
          eventType: params.eventType,
          resourceKey: params.resourceKey,
          periodKey: params.periodKey
        }
      })
      return true
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false
      }
      throw error
    }
  }

  try {
    await d1Run(
      `INSERT INTO NotificationDelivery (id, channel, eventType, resourceKey, periodKey, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [createCuidLike(), params.channel, params.eventType, params.resourceKey, params.periodKey]
    )
    return true
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false
    }
    throw error
  }
}

export async function releaseNotificationDelivery(params: {
  channel: NotificationChannel
  eventType: WebhookEventType
  resourceKey: string
  periodKey: string
}) {
  if (!getD1()) {
    await prisma.notificationDelivery.deleteMany({
      where: {
        channel: params.channel,
        eventType: params.eventType,
        resourceKey: params.resourceKey,
        periodKey: params.periodKey
      }
    })
    return
  }

  await d1Run(
    `DELETE FROM NotificationDelivery
     WHERE channel = ? AND eventType = ? AND resourceKey = ? AND periodKey = ?`,
    [params.channel, params.eventType, params.resourceKey, params.periodKey]
  )
}

export async function storeImportPreview(token: string, preview: WallosImportInspectResultDto, ttlMs: number) {
  const expiresAt = new Date(Date.now() + ttlMs)

  if (!getD1()) {
    await prisma.importPreview.upsert({
      where: { token },
      update: {
        previewJson: preview as unknown as Prisma.InputJsonValue,
        expiresAt
      },
      create: {
        token,
        previewJson: preview as unknown as Prisma.InputJsonValue,
        expiresAt
      }
    })
    return
  }

  await d1Run(
    `INSERT INTO ImportPreview (token, previewJson, expiresAt, createdAt)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(token) DO UPDATE SET previewJson = excluded.previewJson, expiresAt = excluded.expiresAt`,
    [token, JSON.stringify(preview), expiresAt.toISOString()]
  )
}

export async function getImportPreview(token: string) {
  if (!getD1()) {
    const row = await prisma.importPreview.findUnique({ where: { token } })
    if (!row) return null
    if (row.expiresAt.getTime() <= Date.now()) {
      await prisma.importPreview.deleteMany({ where: { token } })
      return null
    }
    return row.previewJson as unknown as WallosImportInspectResultDto
  }

  const row = await d1First<ImportPreviewRow>(
    `SELECT token, previewJson, expiresAt
     FROM ImportPreview
     WHERE token = ?
     LIMIT 1`,
    [token]
  )
  if (!row) return null

  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await deleteImportPreview(token)
    return null
  }

  return parseJsonValue<WallosImportInspectResultDto>(row.previewJson)
}

export async function deleteImportPreview(token: string) {
  if (!getD1()) {
    await prisma.importPreview.deleteMany({ where: { token } })
    return
  }

  await d1Run('DELETE FROM ImportPreview WHERE token = ?', [token])
}
