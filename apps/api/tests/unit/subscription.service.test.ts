import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn()
    },
    paymentRecord: {
      create: vi.fn(),
      delete: vi.fn()
    }
  },
  bumpCacheVersions: vi.fn(async () => 0),
  getBaseCurrency: vi.fn(async () => 'CNY'),
  ensureExchangeRates: vi.fn(async () => ({
    baseCurrency: 'CNY',
    rates: {
      CNY: 1
    }
  })),
  getAppTimezone: vi.fn(async () => 'Asia/Shanghai')
}))

vi.mock('../../src/db', () => ({
  prisma: serviceMocks.prisma
}))

vi.mock('../../src/services/exchange-rate.service', () => ({
  getBaseCurrency: serviceMocks.getBaseCurrency,
  ensureExchangeRates: serviceMocks.ensureExchangeRates
}))

vi.mock('../../src/services/cache-version.service', () => ({
  bumpCacheVersions: serviceMocks.bumpCacheVersions
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppTimezone: serviceMocks.getAppTimezone
}))

describe('subscription service D1 compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('renews subscriptions without relying on Prisma transactions', async () => {
    const nextRenewalDate = new Date('2026-04-21T16:00:00.000Z')
    const periodEnd = new Date('2026-05-21T16:00:00.000Z')

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
    const nextRenewalDate = new Date('2026-04-21T16:00:00.000Z')

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

  it('auto-renews subscriptions that are due in the configured timezone day', async () => {
    const nextRenewalDate = new Date('2026-04-24T16:00:00.000Z')
    const updatedRenewal = new Date('2026-05-24T16:00:00.000Z')

    serviceMocks.prisma.subscription.findMany.mockResolvedValue([
      {
        id: 'sub_1',
        amount: 25,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        nextRenewalDate,
        autoRenew: true,
        status: 'active'
      }
    ])
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
      nextRenewalDate: updatedRenewal,
      status: 'active'
    })

    const { autoRenewDueSubscriptions } = await import('../../src/services/subscription.service')
    const renewedCount = await autoRenewDueSubscriptions(new Date('2026-04-25T01:00:00.000Z'))

    expect(serviceMocks.prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        autoRenew: true,
        status: { in: ['active', 'expired'] },
        nextRenewalDate: {
          lte: new Date('2026-04-25T15:59:59.999Z')
        }
      },
      orderBy: { nextRenewalDate: 'asc' },
      take: 10
    })
    expect(renewedCount).toBe(1)
    expect(serviceMocks.prisma.subscription.findUnique).not.toHaveBeenCalled()
  })

  it('caps auto-renew to one cycle per subscription per invocation', async () => {
    const nextRenewalDate = new Date('2026-04-20T16:00:00.000Z')
    const updatedRenewal = new Date('2026-05-20T16:00:00.000Z')

    serviceMocks.prisma.subscription.findMany.mockResolvedValue([
      {
        id: 'sub_1',
        amount: 25,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        nextRenewalDate,
        autoRenew: true,
        status: 'active'
      }
    ])
    serviceMocks.prisma.paymentRecord.create.mockResolvedValue({ id: 'payment_1' })
    serviceMocks.prisma.subscription.update.mockResolvedValue({
      id: 'sub_1',
      nextRenewalDate: updatedRenewal,
      status: 'active'
    })

    const { autoRenewDueSubscriptions } = await import('../../src/services/subscription.service')
    const renewedCount = await autoRenewDueSubscriptions(new Date('2026-06-25T01:00:00.000Z'))

    expect(renewedCount).toBe(1)
    expect(serviceMocks.prisma.subscription.update).toHaveBeenCalledTimes(1)
  })

  it('continues auto-renew batch when one subscription update fails', async () => {
    const firstRenewalDate = new Date('2026-04-24T16:00:00.000Z')
    const secondRenewalDate = new Date('2026-04-25T16:00:00.000Z')

    serviceMocks.prisma.subscription.findMany.mockResolvedValue([
      {
        id: 'sub_fail',
        amount: 25,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        nextRenewalDate: firstRenewalDate,
        autoRenew: true,
        status: 'active'
      },
      {
        id: 'sub_ok',
        amount: 30,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        nextRenewalDate: secondRenewalDate,
        autoRenew: true,
        status: 'active'
      }
    ])
    serviceMocks.prisma.paymentRecord.create
      .mockResolvedValueOnce({ id: 'payment_fail' })
      .mockResolvedValueOnce({ id: 'payment_ok' })
    serviceMocks.prisma.subscription.update
      .mockRejectedValueOnce(new Error('update failed'))
      .mockResolvedValueOnce({
        id: 'sub_ok',
        nextRenewalDate: new Date('2026-05-25T16:00:00.000Z'),
        status: 'active'
      })
    serviceMocks.prisma.paymentRecord.delete.mockResolvedValue({ id: 'payment_fail' })

    const { autoRenewDueSubscriptions } = await import('../../src/services/subscription.service')
    const renewedCount = await autoRenewDueSubscriptions(new Date('2026-04-26T01:00:00.000Z'))

    expect(renewedCount).toBe(1)
    expect(serviceMocks.prisma.paymentRecord.delete).toHaveBeenCalledWith({
      where: { id: 'payment_fail' }
    })
  })

  it('reconciles expired subscriptions by configured timezone day boundary', async () => {
    serviceMocks.prisma.subscription.findMany.mockResolvedValue([{ id: 'sub_1' }])
    serviceMocks.prisma.subscription.update.mockResolvedValue({ id: 'sub_1', status: 'expired' })

    const { reconcileExpiredSubscriptions } = await import('../../src/services/subscription.service')
    const count = await reconcileExpiredSubscriptions(new Date('2026-04-25T01:00:00.000Z'))

    expect(serviceMocks.prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        nextRenewalDate: {
          lt: new Date('2026-04-24T16:00:00.000Z')
        }
      },
      select: {
        id: true
      }
    })
    expect(count).toBe(1)
  })
})
