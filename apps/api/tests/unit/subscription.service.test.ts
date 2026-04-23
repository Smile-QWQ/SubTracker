import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    paymentRecord: {
      create: vi.fn(),
      delete: vi.fn()
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

  it('renews subscriptions without relying on Prisma transactions', async () => {
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
    expect(serviceMocks.prisma.paymentRecord.create).toHaveBeenCalledTimes(1)
    expect(serviceMocks.prisma.subscription.update).toHaveBeenCalledTimes(1)
  })

  it('rolls back the payment record when subscription update fails', async () => {
    const nextRenewalDate = new Date('2026-04-22T00:00:00.000Z')

    serviceMocks.prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      amount: 25,
      currency: 'CNY',
      billingIntervalCount: 1,
      billingIntervalUnit: 'month',
      nextRenewalDate
    })
    serviceMocks.prisma.paymentRecord.create.mockResolvedValue({ id: 'payment_1' })
    serviceMocks.prisma.subscription.update.mockRejectedValue(new Error('update failed'))
    serviceMocks.prisma.paymentRecord.delete.mockResolvedValue({ id: 'payment_1' })

    const { renewSubscription } = await import('../../src/services/subscription.service')

    await expect(renewSubscription('sub_1')).rejects.toThrow('update failed')
    expect(serviceMocks.prisma.paymentRecord.delete).toHaveBeenCalledWith({
      where: { id: 'payment_1' }
    })
  })
})
