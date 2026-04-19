import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findManySubscriptionsMock, findManyTagsMock } = vi.hoisted(() => ({
  findManySubscriptionsMock: vi.fn(),
  findManyTagsMock: vi.fn()
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
    rates: {}
  })),
  getBaseCurrency: vi.fn(async () => 'CNY')
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    baseCurrency: 'CNY',
    defaultNotifyDays: 3,
    rememberSessionDays: 7,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableTagBudgets: false,
    tagBudgets: {},
    emailNotificationsEnabled: false,
    pushplusNotificationsEnabled: false,
    emailConfig: {
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from: '',
      to: ''
    },
    pushplusConfig: {
      token: '',
      topic: ''
    },
    aiConfig: {
      enabled: false,
      providerPreset: 'custom',
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      timeoutMs: 30000,
      promptTemplate: '',
      capabilities: {
        vision: false,
        structuredOutput: true
      }
    }
  }))
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
})
