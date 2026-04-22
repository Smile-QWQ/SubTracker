import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(async (operations: unknown) => {
      if (typeof operations === 'function') {
        throw new Error('interactive transaction should not be used in renewSubscription')
      }
      return Promise.all(operations as Promise<unknown>[])
    }),
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    paymentRecord: {
      create: vi.fn()
    }
  },
  getBaseCurrency: vi.fn(async () => 'CNY'),
  ensureExchangeRates: vi.fn(async () => ({
    baseCurrency: 'CNY',
    rates: {
      CNY: 1
    }
  }))
}))

vi.mock('../../src/db', () => ({
  prisma: serviceMocks.prisma
}))

vi.mock('../../src/services/exchange-rate.service', () => ({
  getBaseCurrency: serviceMocks.getBaseCurrency,
  ensureExchangeRates: serviceMocks.ensureExchangeRates
}))

describe('subscription service D1 compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('renews subscriptions with batch-style transaction operations instead of interactive transactions', async () => {
    const nextRenewalDate = new Date('2026-04-22T00:00:00.000Z')
    const periodEnd = new Date('2026-05-22T00:00:00.000Z')

    serviceMocks.prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      amount: 25,
      currency: 'CNY',
      billingIntervalCount: 1,
      billingIntervalUnit: 'month',
      nextRenewalDate
    })
    serviceMocks.prisma.paymentRecord.create.mockResolvedValue({ id: 'payment_1' })
    serviceMocks.prisma.subscription.update.mockResolvedValue({
      id: 'sub_1',
      nextRenewalDate: periodEnd,
      status: 'active'
    })

    const { renewSubscription } = await import('../../src/services/subscription.service')
    const result = await renewSubscription('sub_1')

    expect(result.payment).toEqual({ id: 'payment_1' })
    expect(result.subscription).toMatchObject({
      id: 'sub_1',
      status: 'active'
    })
    expect(serviceMocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(typeof serviceMocks.prisma.$transaction.mock.calls[0]?.[0]).not.toBe('function')
  })
})
