import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RESEND_API_URL } from '@subtracker/shared'

const { findManySubscriptionsMock, findManyTagsMock, statisticsSettings } = vi.hoisted(() => ({
  findManySubscriptionsMock: vi.fn(),
  findManyTagsMock: vi.fn(),
  statisticsSettings: {
    enableTagBudgets: false,
    tagBudgets: {} as Record<string, number>
  }
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany: findManySubscriptionsMock
    },
    tag: {
      findMany: findManyTagsMock
    }
  }
}))

vi.mock('../../src/services/exchange-rate.service', () => ({
  ensureExchangeRates: vi.fn(async () => ({
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    rates: {}
  }))
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    defaultNotifyDays: 3,
    rememberSessionDays: 7,
    notifyOnDueDay: true,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableTagBudgets: statisticsSettings.enableTagBudgets,
    overdueReminderDays: [1, 2, 3],
    tagBudgets: statisticsSettings.tagBudgets,
    emailNotificationsEnabled: false,
    emailProvider: 'smtp',
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false,
    smtpConfig: {
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from: '',
      to: ''
    },
    resendConfig: {
      apiBaseUrl: DEFAULT_RESEND_API_URL,
      apiKey: '',
      from: '',
      to: ''
    },
    pushplusConfig: {
      token: '',
      topic: ''
    },
    telegramConfig: {
      botToken: '',
      chatId: ''
    },
    serverchanConfig: {
      sendkey: ''
    },
    gotifyConfig: {
      url: '',
      token: '',
      ignoreSsl: false
    },
    aiConfig: {
      enabled: false,
      dashboardSummaryEnabled: false,
      providerPreset: 'custom',
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      timeoutMs: 30000,
      promptTemplate: '',
      dashboardSummaryPromptTemplate: '',
      capabilities: {
        vision: false,
        structuredOutput: true
      }
    }
  }))
}))

vi.mock('../../src/services/worker-lite-repository.service', () => ({
  listStatisticsSubscriptionsLite: findManySubscriptionsMock,
  listTagsLite: findManyTagsMock
}))

vi.mock('../../src/utils/money', () => ({
  convertAmount: vi.fn((amount: number) => amount)
}))

vi.mock('../../src/services/projected-renewal.service', () => ({
  projectRenewalEvents: vi.fn(() => [])
}))

import { getOverviewStatistics } from '../../src/services/statistics.service'

function createSubscription(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `sub-${id}`,
    description: '',
    amount: 10,
    currency: 'CNY',
    billingIntervalCount: 1,
    billingIntervalUnit: 'month',
    autoRenew: true,
    startDate: new Date('2026-01-01'),
    nextRenewalDate: new Date('2026-02-01'),
    notifyDaysBefore: 3,
    webhookEnabled: true,
    notes: '',
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    tags: [],
    ...overrides
  }
}

describe('statistics service', () => {
  beforeEach(() => {
    statisticsSettings.enableTagBudgets = false
    statisticsSettings.tagBudgets = {}
    findManyTagsMock.mockReset()
    findManySubscriptionsMock.mockReset()
    findManyTagsMock.mockResolvedValue([])
  })

  it('returns top subscriptions sorted by monthly normalized cost and limited to 10', async () => {
    findManySubscriptionsMock.mockResolvedValue([
      createSubscription('yearly', { name: 'Yearly', amount: 1200, billingIntervalUnit: 'year' }),
      createSubscription('monthly', { name: 'Monthly', amount: 50, billingIntervalUnit: 'month' }),
      createSubscription('paused', { name: 'Paused', amount: 999, status: 'paused' }),
      ...Array.from({ length: 12 }, (_, index) =>
        createSubscription(`extra-${index}`, { name: `Extra ${index}`, amount: index + 1, billingIntervalUnit: 'month' })
      )
    ])

    const result = await getOverviewStatistics()

    expect(result.topSubscriptionsByMonthlyCost).toHaveLength(10)
    expect(result.topSubscriptionsByMonthlyCost[0]).toMatchObject({
      id: 'yearly',
      name: 'Yearly',
      monthlyAmountBase: 100,
      baseCurrency: 'CNY'
    })
    expect(result.topSubscriptionsByMonthlyCost.some((item) => item.id === 'paused')).toBe(false)
  })

  it('does not load tag budgets when tag budgets are disabled', async () => {
    findManySubscriptionsMock.mockResolvedValue([createSubscription('monthly')])

    await getOverviewStatistics()

    expect(findManyTagsMock).not.toHaveBeenCalled()
  })

  it('excludes paused subscriptions from tag budget spend', async () => {
    statisticsSettings.enableTagBudgets = true
    statisticsSettings.tagBudgets = { tag_video: 100 }
    findManyTagsMock.mockResolvedValue([{ id: 'tag_video', name: 'Video' }])
    findManySubscriptionsMock.mockResolvedValue([
      createSubscription('active-video', {
        amount: 40,
        tags: [{ tag: { id: 'tag_video', name: 'Video', color: '#3b82f6', icon: 'apps-outline', sortOrder: 0 } }]
      }),
      createSubscription('paused-video', {
        amount: 90,
        status: 'paused',
        tags: [{ tag: { id: 'tag_video', name: 'Video', color: '#3b82f6', icon: 'apps-outline', sortOrder: 0 } }]
      })
    ])

    const result = await getOverviewStatistics()

    expect(result.tagBudgetUsage).toEqual([
      expect.objectContaining({
        tagId: 'tag_video',
        spent: 40,
        budget: 100
      })
    ])
  })

  it('keeps overview dto fields for dashboard and statistics pages', async () => {
    statisticsSettings.enableTagBudgets = true
    statisticsSettings.tagBudgets = { tag_video: 100 }
    findManyTagsMock.mockResolvedValue([{ id: 'tag_video', name: 'Video' }])
    findManySubscriptionsMock.mockResolvedValue([
      createSubscription('active-video', {
        amount: 40,
        tags: [{ tag: { id: 'tag_video', name: 'Video', color: '#3b82f6', icon: 'apps-outline', sortOrder: 0 } }]
      })
    ])

    const result = await getOverviewStatistics()

    expect(result).toMatchObject({
      activeSubscriptions: expect.any(Number),
      upcoming7Days: expect.any(Number),
      upcoming30Days: expect.any(Number),
      monthlyEstimatedBase: expect.any(Number),
      yearlyEstimatedBase: expect.any(Number),
      budgetSummary: {
        monthly: expect.any(Object),
        yearly: expect.any(Object)
      },
      statusDistribution: expect.any(Array),
      renewalModeDistribution: expect.any(Array),
      currencyDistribution: expect.any(Array),
      topSubscriptionsByMonthlyCost: expect.any(Array),
      upcomingRenewals: expect.any(Array)
    })
    expect(Array.isArray(result.monthlyTrend)).toBe(true)
    expect(Array.isArray(result.upcomingByDay)).toBe(true)
    expect(result.monthlyTrendMeta).toEqual({
      mode: 'projected',
      months: 12
    })
    expect(result.tagBudgetSummary).not.toBeNull()
    expect(result.tagBudgetUsage).toEqual([
      expect.objectContaining({
        tagId: 'tag_video',
        budget: 100
      })
    ])
  })
})
