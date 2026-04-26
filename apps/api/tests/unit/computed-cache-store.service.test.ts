import { beforeEach, describe, expect, it, vi } from 'vitest'

const prisma = {
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn()
}

vi.mock('../../src/db', () => ({
  prisma
}))

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database: vi.fn(() => undefined),
  isWorkerRuntime: vi.fn(() => false)
}))

describe('computed cache store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats expired cache rows as misses and deletes them', async () => {
    const { getComputedCache } = await import('../../src/services/computed-cache-store.service')

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        valueJson: JSON.stringify({ stale: true }),
        expiresAt: new Date(Date.now() - 1_000).toISOString()
      }
    ])

    await expect(getComputedCache('statistics', 'overview:v1')).resolves.toBeNull()
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'DELETE FROM "ComputedCache" WHERE "namespace" = ? AND "cacheKey" = ?',
      'statistics',
      'overview:v1'
    )
  })

  it('writes cache rows with ttl and purges expired rows', async () => {
    const { purgeExpiredComputedCache, setComputedCache } = await import('../../src/services/computed-cache-store.service')

    await setComputedCache('calendar', '2026-05:v2', { ok: true }, 600)
    await purgeExpiredComputedCache()

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "ComputedCache"'),
      'calendar',
      '2026-05:v2',
      JSON.stringify({ ok: true }),
      expect.any(String)
    )
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'DELETE FROM "ComputedCache" WHERE "expiresAt" <= ?',
      expect.any(String)
    )
  })
})
