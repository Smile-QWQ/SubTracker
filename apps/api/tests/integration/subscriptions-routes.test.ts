import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  bumpCacheVersions: vi.fn(async () => 0),
  invalidateWorkerLiteCache: vi.fn(async () => undefined),
  withWorkerLiteCache: vi.fn(async (_namespace: string, _key: string, loader: () => Promise<unknown>) => loader()),
  listSubscriptionsLite: vi.fn(async () => []),
  prisma: {
    $transaction: vi.fn(async () => {
      throw new Error('interactive transaction should not be used in worker routes')
    }),
    subscription: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn()
    }
  },
  appendSubscriptionOrder: vi.fn(async () => undefined),
  removeSubscriptionOrder: vi.fn(async () => undefined),
  setSubscriptionOrder: vi.fn(async () => undefined),
  sortSubscriptionsByOrder: vi.fn(async (rows: unknown[]) => rows),
  renewSubscription: vi.fn(),
  normalizeTagIds: vi.fn((tagIds?: string[] | null) => Array.from(new Set((tagIds ?? []).filter(Boolean)))),
  replaceSubscriptionTags: vi.fn(async () => undefined),
  flattenSubscriptionTags: vi.fn((row: unknown) => row),
  deleteLocalLogoFromLibrary: vi.fn(),
  getLocalLogoLibrary: vi.fn(async () => []),
  importRemoteLogo: vi.fn(),
  normalizeLogoForStorage: vi.fn(async ({ logoUrl, logoSource }: { logoUrl?: string | null; logoSource?: string | null }) => ({
    logoUrl: logoUrl ?? null,
    logoSource: logoSource ?? null,
    logoFetchedAt: null
  })),
  saveUploadedLogo: vi.fn(),
  searchSubscriptionLogos: vi.fn(async () => []),
  getDefaultAdvanceReminderRulesSetting: vi.fn(async () => '3&09:30;0&09:30;'),
  getAppTimezone: vi.fn(async () => 'Asia/Shanghai')
}))

vi.mock('../../src/db', () => ({
  prisma: routeMocks.prisma
}))

vi.mock('../../src/services/cache-version.service', () => ({
  bumpCacheVersions: routeMocks.bumpCacheVersions
}))

vi.mock('../../src/services/worker-lite-cache.service', () => ({
  invalidateWorkerLiteCache: routeMocks.invalidateWorkerLiteCache,
  withWorkerLiteCache: routeMocks.withWorkerLiteCache
}))

vi.mock('../../src/services/worker-lite-repository.service', () => ({
  listSubscriptionsLite: routeMocks.listSubscriptionsLite
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  appendSubscriptionOrder: routeMocks.appendSubscriptionOrder,
  removeSubscriptionOrder: routeMocks.removeSubscriptionOrder,
  setSubscriptionOrder: routeMocks.setSubscriptionOrder,
  sortSubscriptionsByOrder: routeMocks.sortSubscriptionsByOrder
}))

vi.mock('../../src/services/subscription.service', () => ({
  renewSubscription: routeMocks.renewSubscription
}))

vi.mock('../../src/services/tag.service', () => ({
  normalizeTagIds: routeMocks.normalizeTagIds,
  replaceSubscriptionTags: routeMocks.replaceSubscriptionTags,
  flattenSubscriptionTags: routeMocks.flattenSubscriptionTags
}))

vi.mock('../../src/services/logo.service', () => ({
  deleteLocalLogoFromLibrary: routeMocks.deleteLocalLogoFromLibrary,
  getLocalLogoLibrary: routeMocks.getLocalLogoLibrary,
  importRemoteLogo: routeMocks.importRemoteLogo,
  normalizeLogoForStorage: routeMocks.normalizeLogoForStorage,
  saveUploadedLogo: routeMocks.saveUploadedLogo,
  searchSubscriptionLogos: routeMocks.searchSubscriptionLogos
}))

vi.mock('../../src/services/settings.service', () => ({
  getDefaultAdvanceReminderRulesSetting: routeMocks.getDefaultAdvanceReminderRulesSetting,
  getAppTimezone: routeMocks.getAppTimezone
}))

describe('subscription routes D1 compatibility', () => {
  const validTagIds = ['cm0a5a6vla9d78e4cec174aa8']

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    routeMocks.prisma.subscription.findUnique.mockReset()
    routeMocks.listSubscriptionsLite.mockReset()
    routeMocks.listSubscriptionsLite.mockResolvedValue([])
  })

  it('creates subscriptions without using Prisma interactive transactions', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prisma.subscription.create.mockResolvedValue({ id: 'sub_1' })
    routeMocks.prisma.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      name: '哔哩哔哩',
      tags: []
    })

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      payload: {
        name: '哔哩哔哩',
        description: '',
        amount: 25,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        autoRenew: false,
        startDate: '2026-04-22',
        nextRenewalDate: '2026-05-22',
        notifyDaysBefore: 3,
        webhookEnabled: true,
        notes: '',
        tagIds: validTagIds
      }
    })

    expect(response.statusCode).toBe(201)
    expect(routeMocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(routeMocks.replaceSubscriptionTags).toHaveBeenCalledWith(routeMocks.prisma, 'sub_1', validTagIds)
    expect(routeMocks.appendSubscriptionOrder).toHaveBeenCalledWith('sub_1')

    await app.close()
  })

  it('updates subscriptions without using Prisma interactive transactions', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prisma.subscription.update.mockResolvedValue({ id: 'sub_1' })
    routeMocks.prisma.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      name: '哔哩哔哩年度大会员',
      tags: []
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/subscriptions/sub_1',
      payload: {
        name: '哔哩哔哩年度大会员',
        tagIds: validTagIds
      }
    })

    expect(response.statusCode).toBe(200)
    expect(routeMocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(routeMocks.replaceSubscriptionTags).toHaveBeenCalledWith(routeMocks.prisma, 'sub_1', validTagIds)

    await app.close()
  })

  it('accepts websiteUrl without protocol and normalizes it on create', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prisma.subscription.create.mockResolvedValue({ id: 'sub_2' })
    routeMocks.prisma.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_2',
      name: 'Netflix',
      websiteUrl: 'https://bilibili.com',
      tags: []
    })

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      payload: {
        name: 'Netflix',
        amount: 10,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        autoRenew: false,
        startDate: '2026-04-22',
        nextRenewalDate: '2026-05-22',
        notifyDaysBefore: 3,
        webhookEnabled: true,
        notes: '',
        websiteUrl: 'bilibili.com',
        tagIds: []
      }
    })

    expect(response.statusCode).toBe(201)
    expect(routeMocks.prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          websiteUrl: 'https://bilibili.com'
        })
      })
    )

    await app.close()
  })

  it('returns a specific validation message for invalid websiteUrl', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions',
      payload: {
        name: 'Netflix',
        amount: 10,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        autoRenew: false,
        startDate: '2026-04-22',
        nextRenewalDate: '2026-05-22',
        notifyDaysBefore: 3,
        webhookEnabled: true,
        notes: '',
        websiteUrl: 'not a url',
        tagIds: []
      }
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.message).toBe('websiteUrl 格式无效，请填写合法网址')

    await app.close()
  })

  it('filters by all selected tags instead of matching any selected tag', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.sortSubscriptionsByOrder.mockResolvedValue([])

    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions?tagIds=tag_a,tag_b'
    })

    expect(response.statusCode).toBe(200)
    expect(routeMocks.normalizeTagIds).toHaveBeenCalledWith(['tag_a', 'tag_b'])
    expect(routeMocks.listSubscriptionsLite).toHaveBeenCalledWith(
      expect.objectContaining({
        tagIds: ['tag_a', 'tag_b']
      })
    )

    await app.close()
  })

  it('supports batch status updates for active paused and cancelled', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prisma.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', status: 'paused' },
      { id: 'sub_2', status: 'cancelled' }
    ])
    routeMocks.prisma.subscription.update.mockResolvedValue({})

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions/batch/status',
      payload: {
        ids: ['sub_1', 'sub_2'],
        status: 'active'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(routeMocks.prisma.subscription.update).toHaveBeenCalledTimes(2)

    await app.close()
  })

  it('rejects batch status updates to expired', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions/batch/status',
      payload: {
        ids: ['sub_1'],
        status: 'expired'
      }
    })

    expect(response.statusCode).toBe(422)
    expect(routeMocks.prisma.subscription.update).not.toHaveBeenCalled()

    await app.close()
  })

  it('restores expired subscriptions to active when future nextRenewalDate is submitted', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prisma.subscription.findUnique.mockResolvedValue({
      status: 'expired'
    })
    routeMocks.prisma.subscription.update.mockResolvedValue({ id: 'sub_1' })
    routeMocks.prisma.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      tags: []
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/subscriptions/sub_1',
      payload: {
        nextRenewalDate: '2027-01-01'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(routeMocks.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active'
        })
      })
    )

    await app.close()
  })

  it('does not auto-reactivate paused subscriptions when future nextRenewalDate is submitted', async () => {
    const { subscriptionRoutes } = await import('../../src/routes/subscriptions')
    const app = Fastify()
    await subscriptionRoutes(app)

    routeMocks.prisma.subscription.findUnique.mockResolvedValue({
      status: 'paused'
    })
    routeMocks.prisma.subscription.update.mockResolvedValue({ id: 'sub_1' })
    routeMocks.prisma.subscription.findUniqueOrThrow.mockResolvedValue({
      id: 'sub_1',
      status: 'paused',
      tags: []
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/subscriptions/sub_1',
      payload: {
        nextRenewalDate: '2027-01-01'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(routeMocks.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          status: 'active'
        })
      })
    )

    await app.close()
  })
})
