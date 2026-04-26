import { prisma } from '../db'
import { getRuntimeD1Database, isWorkerRuntime } from '../runtime'

type ComputedCacheRow = {
  valueJson: unknown
  expiresAt: string | Date
}

export type ComputedCacheEntry<T> = {
  value: T
  expiresAt: Date
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

function parseJsonValue<T>(value: unknown) {
  if (value === null || value === undefined) {
    throw new Error('Computed cache JSON value is empty')
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

function toExpiresAt(value: string | Date) {
  return value instanceof Date ? value : new Date(value)
}

export async function getComputedCacheEntry<T>(namespace: string, cacheKey: string): Promise<ComputedCacheEntry<T> | null> {
  if (!getD1()) {
    const rows = await prisma.$queryRawUnsafe<Array<ComputedCacheRow>>(
      `SELECT "valueJson" AS valueJson, "expiresAt" AS expiresAt
       FROM "ComputedCache"
       WHERE "namespace" = ? AND "cacheKey" = ?
       LIMIT 1`,
      namespace,
      cacheKey
    )
    const row = rows[0] ?? null
    if (!row) return null

    const expiresAt = toExpiresAt(row.expiresAt)
    if (expiresAt.getTime() <= Date.now()) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM "ComputedCache" WHERE "namespace" = ? AND "cacheKey" = ?',
        namespace,
        cacheKey
      )
      return null
    }

    return {
      value: parseJsonValue<T>(row.valueJson),
      expiresAt
    }
  }

  const row = await d1First<ComputedCacheRow>(
    `SELECT "valueJson" AS valueJson, "expiresAt" AS expiresAt
     FROM "ComputedCache"
     WHERE "namespace" = ? AND "cacheKey" = ?
     LIMIT 1`,
    [namespace, cacheKey]
  )
  if (!row) return null

  const expiresAt = toExpiresAt(row.expiresAt)
  if (expiresAt.getTime() <= Date.now()) {
    await d1Run('DELETE FROM "ComputedCache" WHERE "namespace" = ? AND "cacheKey" = ?', [namespace, cacheKey])
    return null
  }

  return {
    value: parseJsonValue<T>(row.valueJson),
    expiresAt
  }
}

export async function getComputedCache<T>(namespace: string, cacheKey: string) {
  const entry = await getComputedCacheEntry<T>(namespace, cacheKey)
  return entry?.value ?? null
}

export async function setComputedCache<T>(namespace: string, cacheKey: string, value: T, ttlSeconds: number) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  const serializedValue = JSON.stringify(value)

  if (!getD1()) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ComputedCache" ("namespace", "cacheKey", "valueJson", "expiresAt", "updatedAt")
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT("namespace", "cacheKey")
       DO UPDATE SET "valueJson" = excluded."valueJson", "expiresAt" = excluded."expiresAt", "updatedAt" = CURRENT_TIMESTAMP`,
      namespace,
      cacheKey,
      serializedValue,
      expiresAt
    )
    return
  }

  await d1Run(
    `INSERT INTO "ComputedCache" ("namespace", "cacheKey", "valueJson", "expiresAt", "updatedAt")
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT("namespace", "cacheKey")
     DO UPDATE SET "valueJson" = excluded."valueJson", "expiresAt" = excluded."expiresAt", "updatedAt" = CURRENT_TIMESTAMP`,
    [namespace, cacheKey, serializedValue, expiresAt]
  )
}

export async function purgeExpiredComputedCache() {
  const now = new Date().toISOString()

  if (!getD1()) {
    await prisma.$executeRawUnsafe('DELETE FROM "ComputedCache" WHERE "expiresAt" <= ?', now)
    return
  }

  await d1Run('DELETE FROM "ComputedCache" WHERE "expiresAt" <= ?', [now])
}
