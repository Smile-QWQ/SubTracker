import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, appendSubscriptionOrders } = vi.hoisted(() => ({
  prismaMock: {
    tag: {
      findMany: vi.fn(),
      createMany: vi.fn()
    },
    subscription: {
      createMany: vi.fn()
    },
    subscriptionTag: {
      createMany: vi.fn()
    }
  },
  appendSubscriptionOrders: vi.fn(async () => undefined)
}))

vi.mock('../../src/db', () => ({
  prisma: prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn()
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  appendSubscriptionOrder: vi.fn(async () => undefined),
  appendSubscriptionOrders
}))

const previewState = vi.hoisted(() => ({
  getImportPreview: vi.fn(),
  storeImportPreview: vi.fn(),
  deleteImportPreview: vi.fn()
}))

vi.mock('../../src/services/worker-lite-state.service', () => previewState)

import { commitWallosImport } from '../../src/services/wallos-import.service'

describe('commitWallosImport', () => {
  beforeEach(() => {
    prismaMock.tag.findMany.mockReset()
    prismaMock.tag.createMany.mockReset()
    prismaMock.subscription.createMany.mockReset()
    prismaMock.subscriptionTag.createMany.mockReset()
    appendSubscriptionOrders.mockClear()
    previewState.getImportPreview.mockReset()
    previewState.deleteImportPreview.mockReset()
    previewState.getImportPreview.mockResolvedValue({
      importToken: 'token-1',
      isWallos: true,
      summary: {
        fileType: 'json',
        subscriptionsTotal: 2,
        tagsTotal: 2,
        usedTagsTotal: 2,
        supportedSubscriptions: 2,
        skippedSubscriptions: 0,
        globalNotifyDays: 3,
        zipLogoMatched: 0,
        zipLogoMissing: 0
      },
      usedTags: [
        { sourceId: 1, name: 'Video', sortOrder: 1 },
        { sourceId: 2, name: 'Music', sortOrder: 2 }
      ],
      tags: [],
      subscriptionsPreview: [
        {
          sourceId: 1,
          name: 'Netflix',
          amount: 10,
          currency: 'USD',
          status: 'active',
          autoRenew: true,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month',
          startDate: '2026-04-01',
          nextRenewalDate: '2026-05-01',
          notifyDaysBefore: 3,
          webhookEnabled: true,
          notes: '',
          description: '',
          websiteUrl: 'https://netflix.com',
          tagNames: ['Video'],
          logoRef: null,
          logoImportStatus: 'none',
          warnings: []
        },
        {
          sourceId: 2,
          name: 'Spotify',
          amount: 15,
          currency: 'USD',
          status: 'active',
          autoRenew: true,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month',
          startDate: '2026-04-02',
          nextRenewalDate: '2026-05-02',
          notifyDaysBefore: 3,
          webhookEnabled: true,
          notes: '',
          description: '',
          websiteUrl: 'https://spotify.com',
          tagNames: ['Music'],
          logoRef: null,
          logoImportStatus: 'none',
          warnings: []
        }
      ],
      warnings: []
    })
  })

  it('batches imported tags, subscription tags and subscription order writes', async () => {
    prismaMock.tag.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'tag_video', name: 'Video' },
        { id: 'tag_music', name: 'Music' }
      ])
    prismaMock.tag.createMany.mockResolvedValue({ count: 2 })
    prismaMock.subscription.createMany.mockResolvedValue({ count: 2 })
    prismaMock.subscriptionTag.createMany.mockResolvedValue({ count: 2 })

    const result = await commitWallosImport({ importToken: 'token-1' })

    expect(prismaMock.tag.findMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.tag.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'Video', color: expect.any(String), sortOrder: 1 },
        { name: 'Music', color: expect.any(String), sortOrder: 2 }
      ]
    })
    expect(prismaMock.subscription.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.subscription.createMany.mock.calls[0][0].data).toHaveLength(2)
    const createdIds = prismaMock.subscription.createMany.mock.calls[0][0].data.map((item: { id: string }) => item.id)
    expect(prismaMock.subscriptionTag.createMany).toHaveBeenCalledWith({
      data: [
        { subscriptionId: createdIds[0], tagId: 'tag_video' },
        { subscriptionId: createdIds[1], tagId: 'tag_music' }
      ]
    })
    expect(appendSubscriptionOrders).toHaveBeenCalledTimes(1)
    expect(appendSubscriptionOrders).toHaveBeenCalledWith(createdIds)
    expect(result).toMatchObject({
      importedTags: 2,
      importedSubscriptions: 2,
      skippedSubscriptions: 0
    })
    expect(previewState.deleteImportPreview).toHaveBeenCalledWith('token-1')
  })
})
