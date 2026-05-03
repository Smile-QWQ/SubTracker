import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const summaryRouteMocks = vi.hoisted(() => ({
  getDashboardAiSummaryMock: vi.fn(),
  generateDashboardAiSummaryMock: vi.fn()
}))

vi.mock('../../src/services/ai-summary.service', () => ({
  getDashboardAiSummary: summaryRouteMocks.getDashboardAiSummaryMock,
  generateDashboardAiSummary: summaryRouteMocks.generateDashboardAiSummaryMock
}))

import { aiRoutes } from '../../src/routes/ai'

describe('ai summary routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await aiRoutes(app)
    summaryRouteMocks.getDashboardAiSummaryMock.mockReset()
    summaryRouteMocks.generateDashboardAiSummaryMock.mockReset()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns dashboard ai summary state', async () => {
    summaryRouteMocks.getDashboardAiSummaryMock.mockResolvedValue({
      scope: 'dashboard-overview',
      status: 'success',
      content: '## 总览',
      previewContent: '- 提要',
      errorMessage: null,
      generatedAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      sourceDataHash: 'hash-1',
      fromCache: true,
      isStale: false,
      canGenerate: true,
      needsGeneration: false
    })

    const res = await app.inject({
      method: 'GET',
      url: '/ai/summary/dashboard'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.status).toBe('success')
    expect(summaryRouteMocks.getDashboardAiSummaryMock).toHaveBeenCalledTimes(1)
  })

  it('generates dashboard ai summary on demand', async () => {
    summaryRouteMocks.generateDashboardAiSummaryMock.mockResolvedValue({
      scope: 'dashboard-overview',
      status: 'success',
      content: '## 总览',
      previewContent: '- 提要',
      errorMessage: null,
      generatedAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      sourceDataHash: 'hash-2',
      fromCache: false,
      isStale: false,
      canGenerate: true,
      needsGeneration: false
    })

    const res = await app.inject({
      method: 'POST',
      url: '/ai/summary/dashboard/generate'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.fromCache).toBe(false)
    expect(summaryRouteMocks.generateDashboardAiSummaryMock).toHaveBeenCalledTimes(1)
  })
})
