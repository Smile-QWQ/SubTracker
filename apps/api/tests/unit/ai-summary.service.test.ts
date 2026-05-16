import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT,
  DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT,
  type DashboardOverview
} from '@subtracker/shared'

const aiSummaryMocks = vi.hoisted(() => ({
  getAiConfigMock: vi.fn(),
  getOverviewStatisticsMock: vi.fn(),
  getComputedCacheMock: vi.fn(),
  setComputedCacheMock: vi.fn(),
  createComputedCacheMock: vi.fn(),
  deleteComputedCacheMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getAiConfig: aiSummaryMocks.getAiConfigMock
}))

vi.mock('../../src/services/statistics.service', () => ({
  getOverviewStatistics: aiSummaryMocks.getOverviewStatisticsMock
}))

vi.mock('../../src/services/computed-cache-store.service', () => ({
  getComputedCache: aiSummaryMocks.getComputedCacheMock,
  setComputedCache: aiSummaryMocks.setComputedCacheMock,
  createComputedCache: aiSummaryMocks.createComputedCacheMock,
  deleteComputedCache: aiSummaryMocks.deleteComputedCacheMock
}))

import {
  generateDashboardAiSummary,
  getDashboardAiSummary,
  resetDashboardAiSummaryCacheForTests
} from '../../src/services/ai-summary.service'

let persistedSummary: unknown = null
let persistedLock: unknown = null

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

function buildOverview(overrides: Partial<DashboardOverview> = {}): DashboardOverview {
  return {
    activeSubscriptions: 6,
    upcoming7Days: 2,
    upcoming30Days: 4,
    monthlyEstimatedBase: 188.6,
    yearlyEstimatedBase: 2263.2,
    monthlyBudgetBase: 300,
    yearlyBudgetBase: 3600,
    monthlyBudgetUsageRatio: 0.6287,
    yearlyBudgetUsageRatio: 0.6287,
    budgetSummary: {
      monthly: {
        spent: 188.6,
        budget: 300,
        ratio: 0.6287,
        overBudget: 0,
        status: 'normal'
      },
      yearly: {
        spent: 2263.2,
        budget: 3600,
        ratio: 0.6287,
        overBudget: 0,
        status: 'normal'
      }
    },
    statusDistribution: [
      { status: 'active', count: 6 },
      { status: 'paused', count: 1 },
      { status: 'cancelled', count: 0 },
      { status: 'expired', count: 1 }
    ],
    currencyDistribution: [
      { currency: 'CNY', amount: 88.6 },
      { currency: 'USD', amount: 14 }
    ],
    topSubscriptionsByMonthlyCost: [
      { id: '1', name: 'Notion', amount: 68, currency: 'CNY', monthlyAmountBase: 68, baseCurrency: 'CNY' }
    ],
    upcomingRenewals: [
      {
        id: '1',
        name: 'Notion',
        nextRenewalDate: '2026-05-04',
        amount: 68,
        currency: 'CNY',
        convertedAmount: 68,
        status: 'active'
      }
    ],
    ...overrides
  }
}

describe('ai summary service', () => {
  beforeEach(() => {
    resetDashboardAiSummaryCacheForTests()
    vi.restoreAllMocks()
    persistedSummary = null
    persistedLock = null
    aiSummaryMocks.getAiConfigMock.mockResolvedValue({
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      dashboardSummaryEnabled: true,
      apiKey: 'test-key',
      promptTemplate: '',
      dashboardSummaryPromptTemplate: '',
      capabilities: {
        ...DEFAULT_AI_CONFIG.capabilities,
        structuredOutput: false
      }
    })
    aiSummaryMocks.getOverviewStatisticsMock.mockResolvedValue(buildOverview())
    aiSummaryMocks.getComputedCacheMock.mockImplementation(async (_namespace, cacheKey) =>
      cacheKey === 'dashboard-overview:lock' ? persistedLock : persistedSummary
    )
    aiSummaryMocks.setComputedCacheMock.mockImplementation(async (_namespace, _cacheKey, value) => {
      persistedSummary = value
    })
    aiSummaryMocks.createComputedCacheMock.mockImplementation(async (_namespace, cacheKey, value) => {
      if (cacheKey === 'dashboard-overview:lock') {
        if (persistedLock) return false
        persistedLock = value
        return true
      }
      if (persistedSummary) return false
      persistedSummary = value
      return true
    })
    aiSummaryMocks.deleteComputedCacheMock.mockImplementation(async (_namespace, cacheKey) => {
      if (cacheKey === 'dashboard-overview:lock') {
        persistedLock = null
      } else {
        persistedSummary = null
      }
    })
  })

  it('returns unconfigured state when AI is disabled', async () => {
    aiSummaryMocks.getAiConfigMock.mockResolvedValue({
      ...DEFAULT_AI_CONFIG,
      enabled: false
    })

    const result = await getDashboardAiSummary()

    expect(result.status).toBe('unconfigured')
    expect(result.canGenerate).toBe(false)
    expect(result.content).toBeNull()
    expect(result.errorMessage).toContain('未启用')
    expect(aiSummaryMocks.setComputedCacheMock).toHaveBeenCalledWith(
      'ai-summary',
      'dashboard-overview',
      expect.objectContaining({
        status: 'unconfigured',
        errorMessage: expect.stringContaining('未启用')
      }),
      30 * 24 * 60 * 60
    )
  })

  it('returns unconfigured state when dashboard summary switch is disabled', async () => {
    aiSummaryMocks.getAiConfigMock.mockResolvedValue({
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      dashboardSummaryEnabled: false,
      apiKey: 'test-key',
      dashboardSummaryPromptTemplate: ''
    })

    const result = await getDashboardAiSummary()

    expect(result.status).toBe('unconfigured')
    expect(result.canGenerate).toBe(false)
    expect(result.errorMessage).toContain('AI 总结未启用')
  })

  it('generates markdown summary and persists latest result for later reloads', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 当前订阅整体平稳'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const generated = await generateDashboardAiSummary()
    const cached = await getDashboardAiSummary()
    resetDashboardAiSummaryCacheForTests()
    const reloaded = await getDashboardAiSummary()

    expect(generated.status).toBe('success')
    expect(generated.fromCache).toBe(false)
    expect(generated.content).toContain('## 总览')
    expect(generated.previewContent).toBeTruthy()
    expect(aiSummaryMocks.setComputedCacheMock).toHaveBeenCalledWith(
      'ai-summary',
      'dashboard-overview',
      expect.objectContaining({
        status: 'success',
        content: generated.content,
        previewContent: generated.previewContent
      }),
      30 * 24 * 60 * 60
    )
    expect(cached.fromCache).toBe(true)
    expect(cached.content).toBe(generated.content)
    expect(cached.previewContent).toBe(generated.previewContent)
    expect(reloaded.fromCache).toBe(true)
    expect(reloaded.status).toBe('success')
    expect(reloaded.content).toBe(generated.content)
    expect(reloaded.previewContent).toBe(generated.previewContent)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('marks stale when statistics input changes', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 首次生成'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateDashboardAiSummary()

    aiSummaryMocks.getOverviewStatisticsMock.mockResolvedValue(
      buildOverview({
        monthlyEstimatedBase: 260
      })
    )

    const result = await getDashboardAiSummary()

    expect(result.status).toBe('success')
    expect(result.isStale).toBe(true)
    expect(result.needsGeneration).toBe(true)
  })

  it('keeps persisted summary available after memory cache reset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 持久化总结'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const generated = await generateDashboardAiSummary()
    resetDashboardAiSummaryCacheForTests()

    const result = await getDashboardAiSummary()

    expect(result.status).toBe('success')
    expect(result.fromCache).toBe(true)
    expect(result.content).toBe(generated.content)
    expect(result.previewContent).toBe(generated.previewContent)
    expect(aiSummaryMocks.getComputedCacheMock).toHaveBeenCalled()
  })

  it('falls back to full summary when preview generation fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: '## 总览\n- 完整总结内容'
              }
            }
          ]
        })
      )
      .mockImplementationOnce(async () => jsonResponse({ choices: [{ message: { content: '   ' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateDashboardAiSummary()

    expect(result.status).toBe('success')
    expect(result.previewContent).toBe('总览 完整总结内容')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('records failed state when model response is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: '   '
              }
            }
          ]
        })
      )
    )

    const result = await generateDashboardAiSummary()

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toContain('空内容')
    expect(result.canGenerate).toBe(true)
    expect(aiSummaryMocks.setComputedCacheMock).toHaveBeenCalledWith(
      'ai-summary',
      'dashboard-overview',
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('空内容')
      }),
      30 * 24 * 60 * 60
    )
  })

  it('returns generating state instead of duplicate generation when distributed lock is already held', async () => {
    persistedLock = {
      scope: 'dashboard-overview',
      ownerId: 'other-instance',
      createdAt: '2026-05-04T00:00:00.000Z',
      expiresAt: '2026-05-04T00:02:00.000Z'
    }

    const result = await generateDashboardAiSummary()

    expect(result.status).toBe('generating')
    expect(result.fromCache).toBe(true)
    expect(result.canGenerate).toBe(true)
    expect(result.needsGeneration).toBe(true)
    expect(aiSummaryMocks.createComputedCacheMock).not.toHaveBeenCalled()
  })

  it('uses dedicated dashboard summary prompt when promptTemplate is empty', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 当前订阅整体平稳'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateDashboardAiSummary()

    const requestBody = JSON.parse(String((((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1])?.body))
    expect(requestBody.messages[0].content).toContain(DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT.trim().slice(0, 20))

    const previewRequestBody = JSON.parse(String((((fetchMock.mock.calls[1] as unknown) as [unknown, RequestInit])[1])?.body))
    expect(previewRequestBody.messages[0].content).toContain(DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT.trim().slice(0, 20))
  })
})
