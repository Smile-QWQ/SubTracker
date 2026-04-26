import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getAppSettingsMock,
  getCacheVersionMock,
  withWorkerTieredCacheMock
} = vi.hoisted(() => ({
  getAppSettingsMock: vi.fn(),
  getCacheVersionMock: vi.fn(),
  withWorkerTieredCacheMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: getAppSettingsMock
}))

vi.mock('../../src/services/cache-version.service', () => ({
  getCacheVersion: getCacheVersionMock
}))

vi.mock('../../src/services/worker-tiered-cache.service', () => ({
  withWorkerTieredCache: withWorkerTieredCacheMock
}))

import { settingsRoutes } from '../../src/routes/settings'

describe('settings routes cache', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    getCacheVersionMock.mockResolvedValue(42)
    getAppSettingsMock.mockResolvedValue({
      baseCurrency: 'CNY',
      timezone: 'Asia/Shanghai'
    })
    withWorkerTieredCacheMock.mockImplementation(
      async (_namespace: string, _cacheKey: string, loader: () => Promise<unknown>) => loader()
    )

    app = Fastify()
    await settingsRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('uses D1 tiered cache for GET /settings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/settings'
    })

    expect(res.statusCode).toBe(200)
    expect(getCacheVersionMock).toHaveBeenCalledWith('settings')
    expect(withWorkerTieredCacheMock).toHaveBeenCalledWith(
      'settings',
      'response:v42',
      expect.any(Function),
      300
    )
    expect(res.json()).toEqual({
      data: {
        baseCurrency: 'CNY',
        timezone: 'Asia/Shanghai'
      }
    })
  })
})
