import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getVersionUpdateSummaryMock: vi.fn()
}))

vi.mock('../../src/services/version-update.service', () => ({
  getVersionUpdateSummary: mocks.getVersionUpdateSummaryMock
}))

describe('version routes', () => {
  beforeEach(() => {
    mocks.getVersionUpdateSummaryMock.mockReset()
    mocks.getVersionUpdateSummaryMock.mockResolvedValue({
      currentVersion: 'abc1234',
      latestVersion: 'def5678',
      hasUpdate: true,
      releases: [
        {
          tagName: 'def5678',
          version: 'def5678',
          name: 'feat: add in-app release update notices',
          body: 'body',
          htmlUrl: 'https://github.com/Smile-QWQ/SubTracker/commit/def5678',
          publishedAt: '2026-05-10T10:00:00Z',
          isPrerelease: false
        }
      ]
    })
  })

  it('returns commit-based version updates', async () => {
    const { versionRoutes } = await import('../../src/routes/version')
    const app = Fastify()
    await versionRoutes(app)

    const res = await app.inject({
      method: 'GET',
      url: '/version/updates?currentVersion=abc1234'
    })

    expect(res.statusCode).toBe(200)
    expect(mocks.getVersionUpdateSummaryMock).toHaveBeenCalledWith('abc1234')
    expect(res.json().data.hasUpdate).toBe(true)

    await app.close()
  })

  it('validates missing currentVersion', async () => {
    const { versionRoutes } = await import('../../src/routes/version')
    const app = Fastify()
    await versionRoutes(app)

    const res = await app.inject({
      method: 'GET',
      url: '/version/updates'
    })

    expect(res.statusCode).toBe(422)

    await app.close()
  })
})
