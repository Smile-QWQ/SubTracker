import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('worker-lite memory cache', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('reuses in-memory values within ttl and inflight window', async () => {
    const { withWorkerLiteCache } = await import('../../src/services/worker-lite-cache.service')
    const loader = vi.fn(async () => 'cached-value')

    const [first, second] = await Promise.all([
      withWorkerLiteCache('settings', 'app-settings', loader, 30),
      withWorkerLiteCache('settings', 'app-settings', loader, 30)
    ])

    expect(first).toBe('cached-value')
    expect(second).toBe('cached-value')
    expect(loader).toHaveBeenCalledTimes(1)

    const third = await withWorkerLiteCache('settings', 'app-settings', loader, 30)
    expect(third).toBe('cached-value')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('clears current-isolate entries on namespace invalidation', async () => {
    const { invalidateWorkerLiteCache, withWorkerLiteCache } = await import('../../src/services/worker-lite-cache.service')
    let version = 0
    const loader = vi.fn(async () => ({ version: ++version }))

    const first = await withWorkerLiteCache('subscriptions', 'all', loader, 30)
    expect(first).toEqual({ version: 1 })

    await invalidateWorkerLiteCache(['subscriptions'])

    const second = await withWorkerLiteCache('subscriptions', 'all', loader, 30)
    expect(second).toEqual({ version: 2 })
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
