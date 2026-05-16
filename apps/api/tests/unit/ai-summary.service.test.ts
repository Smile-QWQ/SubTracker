import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_CONFIG, DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT, DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT, type DashboardOverview } from '@subtracker/shared'

const aiSummaryMocks = vi.hoisted(() => ({
  getAiConfigMock: vi.fn(),
  getOverviewStatisticsMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getAiConfig: aiSummaryMocks.getAiConfigMock
}))

vi.mock('../../src/services/statistics.service', () => ({
  getOverviewStatistics: aiSummaryMocks.getOverviewStatisticsMock
}))

import { generateDashboardAiSummary, getDashboardAiSummary, resetDashboardAiSummaryCacheForTests } from '../../src/services/ai-summary.service'

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
    tagSpend: [
      { name: '办公', value: 88.6 },
      { name: '娱乐', value: 100 }
    ],
    monthlyTrend: [
      { month: '2026-05', amount: 188.6 },
      { month: '2026-06', amount: 188.6 }
    ],
    monthlyTrendMeta: {
      mode: 'projected',
      months: 12
    },
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
    tagBudgetSummary: null,
    statusDistribution: [
      { status: 'active', count: 6 },
      { status: 'paused', count: 1 },
      { status: 'cancelled', count: 0 },
      { status: 'expired', count: 1 }
    ],
    renewalModeDistribution: [
      { autoRenew: true, count: 4, amount: 120 },
      { autoRenew: false, count: 2, amount: 68.6 }
    ],
    upcomingByDay: [
      { date: '2026-05-03', count: 0, amount: 0 },
      { date: '2026-05-04', count: 1, amount: 20 }
    ],
    tagBudgetUsage: [],
    currencyDistribution: [
      { currency: 'CNY', amount: 88.6 },
      { currency: 'USD', amount: 14 }
    ],
    topSubscriptionsByMonthlyCost: [
      { id: '1', name: 'Notion', amount: 68, currency: 'CNY', monthlyAmountBase: 68, baseCurrency: 'CNY' }
    ],
    upcomingRenewals: [
      { id: '1', name: 'Notion', nextRenewalDate: '2026-05-04', amount: 68, currency: 'CNY', convertedAmount: 68, status: 'active' }
    ],
    ...overrides
  }
}

describe('ai summary service', () => {
  beforeEach(() => {
    resetDashboardAiSummaryCacheForTests()
    vi.restoreAllMocks()
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

  it('generates markdown summary and caches latest result in memory', async () => {
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

    expect(generated.status).toBe('success')
    expect(generated.fromCache).toBe(false)
    expect(generated.content).toContain('## 总览')
    expect(generated.previewContent).toBeTruthy()
    expect(cached.fromCache).toBe(true)
    expect(cached.content).toBe(generated.content)
    expect(cached.previewContent).toBe(generated.previewContent)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reuses cache when source data hash has not changed', async () => {
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
    const result = await getDashboardAiSummary()

    expect(result.status).toBe('success')
    expect(result.fromCache).toBe(true)
    expect(result.needsGeneration).toBe(false)
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

  it('always uses dedicated dashboard summary prompt even if recognition prompt is customized', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 使用专用总结提示词'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    aiSummaryMocks.getAiConfigMock.mockResolvedValue({
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      dashboardSummaryEnabled: true,
      apiKey: 'test-key',
      promptTemplate: '你是一个订阅识别助手，只返回 JSON。',
      dashboardSummaryPromptTemplate: '',
      capabilities: {
        ...DEFAULT_AI_CONFIG.capabilities,
        structuredOutput: false
      }
    })

    await generateDashboardAiSummary()

    const requestBody = JSON.parse(String((((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1])?.body))
    expect(requestBody.messages[0].content).toContain(DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT.trim().slice(0, 20))
    expect(requestBody.messages[0].content).not.toContain('只返回 JSON')
  })

  it('prefers custom dashboard summary prompt when configured', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 使用自定义总结提示词'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    aiSummaryMocks.getAiConfigMock.mockResolvedValue({
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      dashboardSummaryEnabled: true,
      apiKey: 'test-key',
      promptTemplate: '你是一个订阅识别助手，只返回 JSON。',
      dashboardSummaryPromptTemplate: '你是一个专门输出统计摘要的助手。',
      capabilities: {
        ...DEFAULT_AI_CONFIG.capabilities,
        structuredOutput: false
      }
    })

    await generateDashboardAiSummary()

    const requestBody = JSON.parse(String((((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1])?.body))
    expect(requestBody.messages[0].content).toContain('专门输出统计摘要的助手')
    expect(requestBody.messages[0].content).not.toContain('只返回 JSON')
  })

  it('shrinks large summary arrays before sending them to AI', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '## 总览\n- 已缩减输入体积'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    aiSummaryMocks.getOverviewStatisticsMock.mockResolvedValue(
      buildOverview({
        tagSpend: Array.from({ length: 10 }, (_, index) => ({ name: `tag-${index}`, value: 10 - index })),
        renewalModeDistribution: [
          { autoRenew: true, count: 4, amount: 120 },
          { autoRenew: false, count: 0, amount: 0 }
        ],
        currencyDistribution: Array.from({ length: 10 }, (_, index) => ({ currency: `C${index}`, amount: 20 - index })),
        topSubscriptionsByMonthlyCost: Array.from({ length: 10 }, (_, index) => ({
          id: `top-${index}`,
          name: `Top ${index}`,
          amount: index + 1,
          currency: 'CNY',
          monthlyAmountBase: index + 1,
          baseCurrency: 'CNY'
        })),
        upcomingRenewals: Array.from({ length: 10 }, (_, index) => ({
          id: `up-${index}`,
          name: `Upcoming ${index}`,
          nextRenewalDate: '2026-05-04',
          amount: index + 1,
          currency: 'CNY',
          convertedAmount: index + 1,
          status: 'active'
        })),
        upcomingByDay: [
          { date: '2026-05-03', count: 0, amount: 0 },
          ...Array.from({ length: 12 }, (_, index) => ({ date: `2026-05-${String(index + 4).padStart(2, '0')}`, count: 1, amount: index + 1 }))
        ],
        tagBudgetUsage: Array.from({ length: 10 }, (_, index) => ({
          tagId: `tb-${index}`,
          name: `tag-budget-${index}`,
          budget: 100,
          spent: 90 - index,
          ratio: 0.9 - index * 0.01,
          remaining: 10 + index,
          overBudget: 0,
          status: 'warning' as const
        }))
      })
    )

    await generateDashboardAiSummary()

    const requestBody = JSON.parse(String((((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1])?.body))
    const content = String(requestBody.messages[1].content)
    const payload = JSON.parse(content.slice(content.indexOf('{')))

    expect(payload.tagSpendTop).toHaveLength(6)
    expect(payload.renewalModeDistribution).toHaveLength(1)
    expect(payload.currencyDistribution).toHaveLength(8)
    expect(payload.upcomingRenewalsTop).toHaveLength(6)
    expect(payload.topSubscriptionsByMonthlyCost).toHaveLength(6)
    expect(payload.upcomingByDayNonZero).toHaveLength(10)
    expect(payload.tagBudgetUsageTop).toHaveLength(6)
  })
})
