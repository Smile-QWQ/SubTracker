import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RESEND_API_URL } from '@subtracker/shared'
import { invalidateWorkerLiteCache } from '../../src/services/worker-lite-cache.service'

const {
  findManySubscriptionsMock,
  countSubscriptionsMock,
  isWorkerRuntimeMock,
  getLiteOverviewStatisticsSnapshotMock
} = vi.hoisted(() => ({
  findManySubscriptionsMock: vi.fn(),
  countSubscriptionsMock: vi.fn(),
  isWorkerRuntimeMock: vi.fn(),
  getLiteOverviewStatisticsSnapshotMock: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany: findManySubscriptionsMock,
      count: countSubscriptionsMock
    }
  }
}))

vi.mock('../../src/services/exchange-rate.service', () => ({
  ensureExchangeRates: vi.fn(async () => ({
    baseCurrency: 'CNY',
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
    overdueReminderDays: [1, 2, 3],
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
  listStatisticsSubscriptionsLite: findManySubscriptionsMock
}))

vi.mock('../../src/services/worker-lite-statistics.repository', () => ({
  getLiteOverviewStatisticsSnapshot: getLiteOverviewStatisticsSnapshotMock
}))

vi.mock('../../src/utils/money', () => ({
  convertAmount: vi.fn((amount: number) => amount)
}))

vi.mock('../../src/runtime', () => ({
  isWorkerRuntime: isWorkerRuntimeMock
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
  beforeEach(async () => {
    await invalidateWorkerLiteCache(['statistics', 'settings', 'exchange-rates'])
    findManySubscriptionsMock.mockReset()
    countSubscriptionsMock.mockReset()
    getLiteOverviewStatisticsSnapshotMock.mockReset()
    isWorkerRuntimeMock.mockReset()
    isWorkerRuntimeMock.mockReturnValue(false)
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('degrades lite worker overview via lightweight snapshot without projected trend or tag loads', async () => {
    isWorkerRuntimeMock.mockReturnValue(true)
    getLiteOverviewStatisticsSnapshotMock.mockResolvedValue({
      activeSubscriptions: [
        {
          id: 'monthly',
          name: 'Monthly',
          amount: 50,
          currency: 'CNY',
          billingIntervalCount: 1,
          billingIntervalUnit: 'month',
          autoRenew: true
        }
      ],
      statusCounts: [
        { status: 'active', count: 1 },
        { status: 'paused', count: 0 },
        { status: 'cancelled', count: 0 },
        { status: 'expired', count: 1 }
      ],
      upcomingCounts: {
        upcoming7DaysCount: 1,
        upcoming30DaysCount: 2
      },
      upcomingRenewals: [
        {
          id: 'upcoming',
          name: 'Upcoming',
          amount: 12,
          currency: 'CNY',
          status: 'expired',
          nextRenewalDate: new Date('2026-01-05T00:00:00.000Z')
        }
      ]
    })

    const result = await getOverviewStatistics()

    expect(findManySubscriptionsMock).not.toHaveBeenCalled()
    expect(getLiteOverviewStatisticsSnapshotMock).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveProperty('monthlyTrend')
    expect(result).not.toHaveProperty('upcomingByDay')
    expect(result).not.toHaveProperty('tagSpend')
    expect(result).not.toHaveProperty('tagBudgetUsage')
    expect(result.statusDistribution).toEqual([
      { status: 'active', count: 1 },
      { status: 'paused', count: 0 },
      { status: 'cancelled', count: 0 },
      { status: 'expired', count: 1 }
    ])
    expect(result.upcomingRenewals).toEqual([
      {
        id: 'upcoming',
        name: 'Upcoming',
        nextRenewalDate: '2026-01-05',
        amount: 12,
        currency: 'CNY',
        convertedAmount: 12,
        status: 'expired'
      }
    ])
  })

  it('formats upcoming renewal dates in configured timezone', async () => {
    vi.setSystemTime(new Date('2026-04-25T01:00:00.000Z'))
    findManySubscriptionsMock.mockResolvedValue([
      createSubscription('upcoming', {
        nextRenewalDate: new Date('2026-04-29T16:00:00.000Z')
      })
    ])

    const result = await getOverviewStatistics()

    expect(result.upcomingRenewals[0]).toMatchObject({
      nextRenewalDate: '2026-04-30'
    })
  })

})
