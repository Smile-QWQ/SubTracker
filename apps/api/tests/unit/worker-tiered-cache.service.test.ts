import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getComputedCacheEntryMock, setComputedCacheMock } = vi.hoisted(() => ({
  getComputedCacheEntryMock: vi.fn(),
  setComputedCacheMock: vi.fn()
}))

vi.mock('../../src/services/computed-cache-store.service', () => ({
  getComputedCacheEntry: getComputedCacheEntryMock,
  setComputedCache: setComputedCacheMock
}))

describe('worker tiered cache', () => {
  beforeEach(() => {
    vi.resetModules()
    getComputedCacheEntryMock.mockReset()
    setComputedCacheMock.mockReset()
    vi.useRealTimers()
  })

  it('reuses persistent cache values and warms current isolate memory', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))

    getComputedCacheEntryMock.mockResolvedValueOnce({
      value: { source: 'd1' },
      expiresAt: new Date('2026-04-26T12:05:00.000Z')
    })
    const { withWorkerTieredCache } = await import('../../src/services/worker-tiered-cache.service')
    const loader = vi.fn(async () => ({ source: 'loader' }))

    const first = await withWorkerTieredCache('statistics', 'overview:v1', loader, 300)
    const second = await withWorkerTieredCache('statistics', 'overview:v1', loader, 300)

    expect(first).toEqual({ source: 'd1' })
    expect(second).toEqual({ source: 'd1' })
    expect(getComputedCacheEntryMock).toHaveBeenCalledTimes(1)
    expect(loader).not.toHaveBeenCalled()
    expect(setComputedCacheMock).not.toHaveBeenCalled()
  })

  it('deduplicates double-miss loads and persists the computed value once', async () => {
    getComputedCacheEntryMock.mockResolvedValue(null)
    const { withWorkerTieredCache } = await import('../../src/services/worker-tiered-cache.service')
    const loader = vi.fn(async () => ({ source: 'fresh' }))

    const [first, second] = await Promise.all([
      withWorkerTieredCache('calendar', '2026-05:v2', loader, 600),
      withWorkerTieredCache('calendar', '2026-05:v2', loader, 600)
    ])

    expect(first).toEqual({ source: 'fresh' })
    expect(second).toEqual({ source: 'fresh' })
    expect(getComputedCacheEntryMock).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(setComputedCacheMock).toHaveBeenCalledTimes(1)
    expect(setComputedCacheMock).toHaveBeenCalledWith('calendar', '2026-05:v2', { source: 'fresh' }, 600)
  })

  it('caps warmed memory ttl by persistent cache remaining lifetime', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))

    getComputedCacheEntryMock.mockResolvedValue({
      value: { source: 'd1' },
      expiresAt: new Date('2026-04-26T12:00:10.000Z')
    })

    const { withWorkerTieredCache } = await import('../../src/services/worker-tiered-cache.service')

    await withWorkerTieredCache('statistics', 'overview:v1', async () => ({ source: 'loader' }), 300)

    vi.advanceTimersByTime(11_000)

    await withWorkerTieredCache('statistics', 'overview:v1', async () => ({ source: 'loader' }), 300)

    expect(getComputedCacheEntryMock).toHaveBeenCalledTimes(2)
  })
})
