import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => {
  const tx = {
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn()
    }
  }

  return {
    tx,
    prismaMock: {
      subscription: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn()
      },
      paymentRecord: {
        findMany: vi.fn()
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(tx))
    },
    appendSubscriptionOrderMock: vi.fn(async () => undefined),
    removeSubscriptionOrderMock: vi.fn(async () => undefined),
    setSubscriptionOrderMock: vi.fn(async () => undefined),
    sortSubscriptionsByOrderMock: vi.fn(async (rows: unknown[]) => rows),
    renewSubscriptionMock: vi.fn(),
    normalizeTagIdsMock: vi.fn((tagIds: string[]) => tagIds),
    replaceSubscriptionTagsMock: vi.fn(async () => undefined),
    flattenSubscriptionTagsMock: vi.fn((row: unknown) => row),
    normalizeLogoForStorageMock: vi.fn(async ({ logoUrl, logoSource }: { logoUrl?: string | null; logoSource?: string | null }) => ({
      logoUrl: logoUrl ?? null,
      logoSource: logoSource ?? null,
      logoFetchedAt: null
    })),
    getDefaultAdvanceReminderRulesSettingMock: vi.fn(async () => '3&09:30;0&09:30;'),
    getAppTimezoneMock: vi.fn(async () => 'Asia/Shanghai')
  }
})

vi.mock('../../src/db', () => ({
  prisma: routeMocks.prismaMock
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  appendSubscriptionOrder: routeMocks.appendSubscriptionOrderMock,
  removeSubscriptionOrder: routeMocks.removeSubscriptionOrderMock,
  setSubscriptionOrder: routeMocks.setSubscriptionOrderMock,
  sortSubscriptionsByOrder: routeMocks.sortSubscriptionsByOrderMock
}))

vi.mock('../../src/services/subscription.service', () => ({
  renewSubscription: routeMocks.renewSubscriptionMock
}))

vi.mock('../../src/services/tag.service', () => ({
  flattenSubscriptionTags: routeMocks.flattenSubscriptionTagsMock,
  normalizeTagIds: routeMocks.normalizeTagIdsMock,
  replaceSubscriptionTags: routeMocks.replaceSubscriptionTagsMock
}))

vi.mock('../../src/services/logo.service', () => ({
  deleteLocalLogoFromLibrary: vi.fn(),
  getLocalLogoLibrary: vi.fn(async () => []),
  importRemoteLogo: vi.fn(),
  normalizeLogoForStorage: routeMocks.normalizeLogoForStorageMock,
  saveUploadedLogo: vi.fn(),
  searchSubscriptionLogos: vi.fn(async () => [])
}))

vi.mock('../../src/services/reminder-rules.service', () => ({
  appendSubscriptionOrder: routeMocks.appendSubscriptionOrderMock,
  buildAdvanceReminderRulesFromLegacyWithDefault: vi.fn((notifyDaysBefore: number) => `${notifyDaysBefore}&09:30;`),
  deriveNotifyDaysBeforeFromAdvanceRules: vi.fn(() => 3),
  normalizeOptionalReminderRules: vi.fn((value: string | null | undefined) => value ?? null)
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppTimezone: routeMocks.getAppTimezoneMock,
  getDefaultAdvanceReminderRulesSetting: routeMocks.getDefaultAdvanceReminderRulesSettingMock
}))

import { subscriptionRoutes } from '../../src/routes/subscriptions'

describe('subscription routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prismaMock.$transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) => callback(routeMocks.tx))
    routeMocks.prismaMock.subscription.findMany.mockReset()
    routeMocks.prismaMock.subscription.findUnique.mockReset()
    routeMocks.prismaMock.subscription.findUniqueOrThrow.mockReset()
    routeMocks.prismaMock.subscription.create.mockReset()
    routeMocks.prismaMock.subscription.update.mockReset()
    routeMocks.tx.subscription.findUnique.mockReset()
    routeMocks.tx.subscription.create.mockReset()
    routeMocks.tx.subscription.update.mockReset()
    routeMocks.tx.subscription.findUniqueOrThrow.mockReset()
    routeMocks.appendSubscriptionOrderMock.mockReset()
    routeMocks.replaceSubscriptionTagsMock.mockReset()
    routeMocks.normalizeLogoForStorageMock.mockClear()
  })

  afterEach(async () => {
    await app.close()
  })

  it('accepts websiteUrl without protocol and normalizes it on create', async () => {
    routeMocks.tx.subscription.create.mockResolvedValue({
      id: 'sub_1'
    })
    routeMocks.tx.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      name: 'GitHub Pro',
      websiteUrl: 'https://bilibili.com',
      tags: []
    })

    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      payload: {
        name: 'GitHub Pro',
        amount: 99,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'year',
        startDate: '2024-01-01',
        nextRenewalDate: '2027-01-01',
        websiteUrl: 'bilibili.com'
      }
    })

    expect(res.statusCode).toBe(201)
    expect(routeMocks.tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          websiteUrl: 'https://bilibili.com'
        })
      })
    )
  })

  it('returns a specific 422 message for invalid websiteUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      payload: {
        name: 'GitHub Pro',
        amount: 99,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'year',
        startDate: '2024-01-01',
        nextRenewalDate: '2027-01-01',
        websiteUrl: 'not a url'
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toBe('websiteUrl 格式无效，请填写合法网址')
  })

  it('filters by all selected tags instead of matching any selected tag', async () => {
    routeMocks.prismaMock.subscription.findMany.mockResolvedValue([])

    const res = await app.inject({
      method: 'GET',
      url: '/subscriptions?tagIds=tag_a,tag_b'
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.prismaMock.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { tags: { some: { tagId: 'tag_a' } } },
            { tags: { some: { tagId: 'tag_b' } } }
          ]
        })
      })
    )
  })

  it('batch updates mixed subscription statuses to a user-selected status', async () => {
    routeMocks.prismaMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', status: 'paused' },
      { id: 'sub_2', status: 'cancelled' }
    ])
    routeMocks.prismaMock.subscription.update.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/batch/status',
      payload: {
        ids: ['sub_1', 'sub_2'],
        status: 'active'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      successCount: 2,
      failureCount: 0
    })
    expect(routeMocks.prismaMock.subscription.update).toHaveBeenCalledTimes(2)
    expect(routeMocks.prismaMock.subscription.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'sub_1' },
      data: { status: 'active' }
    })
    expect(routeMocks.prismaMock.subscription.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'sub_2' },
      data: { status: 'active' }
    })
  })

  it('rejects batch status updates to system-only expired status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/batch/status',
      payload: {
        ids: ['sub_1'],
        status: 'expired'
      }
    })

    expect(res.statusCode).toBe(422)
    expect(routeMocks.prismaMock.subscription.update).not.toHaveBeenCalled()
  })

  it('restores expired subscriptions to active when nextRenewalDate is moved to the future', async () => {
    routeMocks.tx.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      status: 'expired'
    })
    routeMocks.tx.subscription.update.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      nextRenewalDate: new Date('2027-01-01T00:00:00.000Z'),
      tags: []
    })
    routeMocks.tx.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      nextRenewalDate: '2027-01-01',
      tags: []
    })

    const res = await app.inject({
      method: 'PATCH',
      url: '/subscriptions/sub_1',
      payload: {
        nextRenewalDate: '2027-01-01'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active'
        })
      })
    )
  })

  it('does not auto-reactivate paused subscriptions when editing future nextRenewalDate', async () => {
    routeMocks.tx.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      status: 'paused'
    })
    routeMocks.tx.subscription.update.mockResolvedValue({
      id: 'sub_1',
      status: 'paused',
      nextRenewalDate: new Date('2027-01-01T00:00:00.000Z'),
      tags: []
    })
    routeMocks.tx.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      status: 'paused',
      nextRenewalDate: '2027-01-01',
      tags: []
    })

    const res = await app.inject({
      method: 'PATCH',
      url: '/subscriptions/sub_1',
      payload: {
        nextRenewalDate: '2027-01-01'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          status: 'active'
        })
      })
    )
  })
})
