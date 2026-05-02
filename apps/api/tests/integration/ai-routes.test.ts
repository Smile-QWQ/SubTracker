import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const summaryRouteMocks = vi.hoisted(() => ({
  getDashboardAiSummaryMock: vi.fn(),
  generateDashboardAiSummaryMock: vi.fn(),
  recognizeSubscriptionByAiMock: vi.fn(),
  testAiConnectionMock: vi.fn(),
  testAiVisionConnectionMock: vi.fn()
}))

vi.mock('../../src/services/ai-summary.service', () => ({
  getDashboardAiSummary: summaryRouteMocks.getDashboardAiSummaryMock,
  generateDashboardAiSummary: summaryRouteMocks.generateDashboardAiSummaryMock
}))

vi.mock('../../src/services/ai.service', () => ({
  recognizeSubscriptionByAi: summaryRouteMocks.recognizeSubscriptionByAiMock,
  testAiConnection: summaryRouteMocks.testAiConnectionMock,
  testAiVisionConnection: summaryRouteMocks.testAiVisionConnectionMock
}))

import { aiRoutes } from '../../src/routes/ai'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

describe('ai routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await aiRoutes(app)
    vi.restoreAllMocks()
    summaryRouteMocks.getDashboardAiSummaryMock.mockReset()
    summaryRouteMocks.generateDashboardAiSummaryMock.mockReset()
    summaryRouteMocks.recognizeSubscriptionByAiMock.mockReset()
    summaryRouteMocks.testAiConnectionMock.mockReset()
    summaryRouteMocks.testAiVisionConnectionMock.mockReset()
    summaryRouteMocks.testAiConnectionMock.mockResolvedValue({
      success: true,
      providerName: '测试 Provider',
      model: 'test-model',
      response: 'OK'
    })
    summaryRouteMocks.testAiVisionConnectionMock.mockResolvedValue({
      success: true,
      providerName: '测试 Provider',
      model: 'test-model',
      response: '已收到图片'
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await app.close()
  })

  it('tests connection with override payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/test',
      payload: {
        enabled: true,
        providerName: '阿里百炼',
        providerPreset: 'aliyun-bailian',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'token',
        model: 'qwen3-vl-plus',
        timeoutMs: 30000,
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.providerName).toBe('测试 Provider')
    expect(summaryRouteMocks.testAiConnectionMock).toHaveBeenCalledTimes(1)
    expect(summaryRouteMocks.testAiConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: '阿里百炼',
        providerPreset: 'aliyun-bailian',
        model: 'qwen3-vl-plus'
      })
    )
  })

  it('allows connection test with override payload even when enabled is false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/test',
      payload: {
        enabled: false,
        providerName: '火山方舟',
        providerPreset: 'volcengine-ark',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: 'token',
        model: 'doubao-1-5-vision-pro-32k-250115',
        timeoutMs: 30000,
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.response).toBe('OK')
  })

  it('tests vision endpoint with image_url payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/test-vision',
      payload: {
        enabled: true,
        providerName: '腾讯混元',
        providerPreset: 'tencent-hunyuan',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        apiKey: 'token',
        model: 'hunyuan-vision',
        timeoutMs: 30000,
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(summaryRouteMocks.testAiVisionConnectionMock).toHaveBeenCalledTimes(1)
  })

  it('rejects vision test when vision capability is disabled', async () => {
    summaryRouteMocks.testAiVisionConnectionMock.mockRejectedValue(new Error('当前 Provider 未启用视觉输入能力'))

    const res = await app.inject({
      method: 'POST',
      url: '/ai/test-vision',
      payload: {
        enabled: true,
        providerName: '自定义',
        providerPreset: 'custom',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'token',
        model: 'deepseek-chat',
        timeoutMs: 30000,
        capabilities: {
          vision: false,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('视觉输入能力')
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
