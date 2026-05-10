import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const versionRouteMocks = vi.hoisted(() => ({
  getVersionUpdateSummaryMock: vi.fn()
}))

vi.mock('../../src/services/version-update.service', () => ({
  getVersionUpdateSummary: versionRouteMocks.getVersionUpdateSummaryMock
}))

import { versionRoutes } from '../../src/routes/version'

describe('version routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await versionRoutes(app)
    versionRouteMocks.getVersionUpdateSummaryMock.mockReset()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns release updates above current version', async () => {
    versionRouteMocks.getVersionUpdateSummaryMock.mockResolvedValue({
      currentVersion: '0.7.6',
      latestVersion: '0.8.0',
      hasUpdate: true,
      releases: [
        {
          tagName: 'v0.8.0',
          version: '0.8.0',
          name: 'v0.8.0',
          body: '## 更新内容',
          htmlUrl: 'https://github.com/Smile-QWQ/SubTracker/releases/tag/v0.8.0',
          publishedAt: '2026-05-10T00:00:00.000Z',
          isPrerelease: false
        }
      ]
    })

    const res = await app.inject({
      method: 'GET',
      url: '/version/updates?currentVersion=0.7.6'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.hasUpdate).toBe(true)
    expect(res.json().data.latestVersion).toBe('0.8.0')
  })
})
