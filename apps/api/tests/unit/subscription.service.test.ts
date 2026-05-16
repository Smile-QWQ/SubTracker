import { beforeEach, describe, expect, it, vi } from 'vitest'

const subscriptionMocks = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
  paymentCreateMock: vi.fn(),
  subscriptionUpdateMock: vi.fn(),
  transactionMock: vi.fn(),
  getBaseCurrencyMock: vi.fn(),
  ensureExchangeRatesMock: vi.fn(),
  getAppTimezoneMock: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findUnique: subscriptionMocks.findUniqueMock,
      findMany: subscriptionMocks.findManyMock,
      update: vi.fn()
    },
    paymentRecord: {
      create: vi.fn()
    },
    $transaction: subscriptionMocks.transactionMock
  }
}))

vi.mock('../../src/services/exchange-rate.service', () => ({
  getBaseCurrency: subscriptionMocks.getBaseCurrencyMock,
  ensureExchangeRates: subscriptionMocks.ensureExchangeRatesMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppTimezone: subscriptionMocks.getAppTimezoneMock
}))

import { autoRenewDueSubscriptions, renewSubscription } from '../../src/services/subscription.service'

const AUTO_RENEW_BATCH_LIMIT = 100
const AUTO_RENEW_MAX_CYCLES_PER_SUBSCRIPTION = 24

function createSubscription(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `sub-${id}`,
    amount: 10,
    currency: 'USD',
    billingIntervalCount: 1,
    billingIntervalUnit: 'month',
    nextRenewalDate: new Date('2026-05-01T00:00:00.000Z'),
    status: 'active',
    autoRenew: true,
    ...overrides
  }
}

describe('subscription service', () => {
  beforeEach(() => {
    subscriptionMocks.findUniqueMock.mockReset()
    subscriptionMocks.findManyMock.mockReset()
    subscriptionMocks.paymentCreateMock.mockReset()
    subscriptionMocks.subscriptionUpdateMock.mockReset()
    subscriptionMocks.transactionMock.mockReset()
    subscriptionMocks.getBaseCurrencyMock.mockReset()
    subscriptionMocks.ensureExchangeRatesMock.mockReset()
    subscriptionMocks.getAppTimezoneMock.mockReset()

    subscriptionMocks.getBaseCurrencyMock.mockResolvedValue('CNY')
    subscriptionMocks.ensureExchangeRatesMock.mockResolvedValue({
      baseCurrency: 'CNY',
      rates: { USD: 0.14 }
    })
    subscriptionMocks.getAppTimezoneMock.mockResolvedValue('Asia/Shanghai')
    subscriptionMocks.transactionMock.mockImplementation(async (run: (tx: {
      paymentRecord: { create: typeof subscriptionMocks.paymentCreateMock }
      subscription: { update: typeof subscriptionMocks.subscriptionUpdateMock }
    }) => Promise<unknown>) =>
      run({
        paymentRecord: { create: subscriptionMocks.paymentCreateMock },
        subscription: { update: subscriptionMocks.subscriptionUpdateMock }
      })
    )
  })

  it('renews a single subscription with fetched context', async () => {
    subscriptionMocks.findUniqueMock.mockResolvedValue(createSubscription('single'))
    subscriptionMocks.paymentCreateMock.mockResolvedValue({ id: 'pay_1' })
    subscriptionMocks.subscriptionUpdateMock.mockResolvedValue({
      ...createSubscription('single'),
      nextRenewalDate: new Date('2026-06-01T00:00:00.000Z')
    })

    const result = await renewSubscription('single')

    expect(result.payment).toMatchObject({ id: 'pay_1' })
    expect(subscriptionMocks.getBaseCurrencyMock).toHaveBeenCalledTimes(1)
    expect(subscriptionMocks.ensureExchangeRatesMock).toHaveBeenCalledTimes(1)
    expect(subscriptionMocks.getAppTimezoneMock).toHaveBeenCalledTimes(1)
  })

  it('uses configured batch limit and shared context for auto renew', async () => {
    const dueSubscriptions = [createSubscription('a'), createSubscription('b')]
    subscriptionMocks.findManyMock.mockResolvedValue(dueSubscriptions)
    subscriptionMocks.paymentCreateMock.mockResolvedValue({ id: 'pay_1' })
    subscriptionMocks.subscriptionUpdateMock
      .mockResolvedValueOnce({
        ...dueSubscriptions[0],
        nextRenewalDate: new Date('2026-06-01T00:00:00.000Z'),
        status: 'active'
      })
      .mockResolvedValueOnce({
        ...dueSubscriptions[1],
        nextRenewalDate: new Date('2026-06-01T00:00:00.000Z'),
        status: 'active'
      })

    const renewedCount = await autoRenewDueSubscriptions(new Date('2026-05-20T00:00:00.000Z'))

    expect(renewedCount).toBe(2)
    expect(subscriptionMocks.findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        take: AUTO_RENEW_BATCH_LIMIT
      })
    )
    expect(subscriptionMocks.getBaseCurrencyMock).toHaveBeenCalledTimes(1)
    expect(subscriptionMocks.ensureExchangeRatesMock).toHaveBeenCalledTimes(1)
    expect(subscriptionMocks.getAppTimezoneMock).toHaveBeenCalledTimes(1)
  })

  it('caps per-subscription catch-up cycles by config', async () => {
    const subscription = createSubscription('looping', {
      nextRenewalDate: new Date('2024-01-01T00:00:00.000Z')
    })
    subscriptionMocks.findManyMock.mockResolvedValue([subscription])
    subscriptionMocks.paymentCreateMock.mockResolvedValue({ id: 'pay_loop' })
    subscriptionMocks.subscriptionUpdateMock.mockImplementation(async ({ data }: { data: { nextRenewalDate: Date; status: string } }) => ({
      ...subscription,
      nextRenewalDate: data.nextRenewalDate,
      status: data.status
    }))

    const renewedCount = await autoRenewDueSubscriptions(new Date('2026-05-20T00:00:00.000Z'))

    expect(renewedCount).toBe(AUTO_RENEW_MAX_CYCLES_PER_SUBSCRIPTION)
    expect(subscriptionMocks.subscriptionUpdateMock).toHaveBeenCalledTimes(AUTO_RENEW_MAX_CYCLES_PER_SUBSCRIPTION)
  })
})
