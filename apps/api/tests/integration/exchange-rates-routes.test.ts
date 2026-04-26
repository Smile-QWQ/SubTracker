import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getCacheVersionMock,
  getLatestSnapshotMock,
  withWorkerTieredCacheMock
} = vi.hoisted(() => ({
  getCacheVersionMock: vi.fn(),
  getLatestSnapshotMock: vi.fn(),
  withWorkerTieredCacheMock: vi.fn()
}))

vi.mock('../../src/services/cache-version.service', () => ({
  getCacheVersion: getCacheVersionMock
}))

vi.mock('../../src/services/worker-tiered-cache.service', () => ({
  withWorkerTieredCache: withWorkerTieredCacheMock
}))

vi.mock('../../src/services/worker-lite-cache.service', () => ({
  invalidateWorkerLiteCache: vi.fn()
}))

vi.mock('../../src/services/exchange-rate.service', () => ({
  ensureExchangeRates: vi.fn(),
  getLatestSnapshot: getLatestSnapshotMock,
  refreshExchangeRates: vi.fn()
}))

import { exchangeRateRoutes } from '../../src/routes/exchange-rates'

describe('exchange rates routes cache', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    getCacheVersionMock.mockResolvedValue(77)
    getLatestSnapshotMock.mockResolvedValue({
      baseCurrency: 'CNY',
      rates: { USD: 0.14 },
      fetchedAt: '2026-04-26T08:00:00.000Z',
      provider: 'ExchangeRate-API',
      providerUrl: 'https://open.er-api.com/v6/latest',
      isStale: false
    })
    withWorkerTieredCacheMock.mockImplementation(
      async (_namespace: string, _cacheKey: string, loader: () => Promise<unknown>) => loader()
    )

    app = Fastify()
    await exchangeRateRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('uses D1 tiered cache for GET /exchange-rates/latest', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/exchange-rates/latest'
    })

    expect(res.statusCode).toBe(200)
    expect(getCacheVersionMock).toHaveBeenCalledWith('exchangeRates')
    expect(withWorkerTieredCacheMock).toHaveBeenCalledWith(
      'exchange-rates',
      'latest:v77',
      expect.any(Function),
      300
    )
    expect(res.json()).toEqual({
      data: {
        baseCurrency: 'CNY',
        rates: { USD: 0.14 },
        fetchedAt: '2026-04-26T08:00:00.000Z',
        provider: 'ExchangeRate-API',
        providerUrl: 'https://open.er-api.com/v6/latest',
        isStale: false
      }
    })
  })
})
