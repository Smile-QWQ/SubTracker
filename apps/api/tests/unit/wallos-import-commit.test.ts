import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WallosImportCommitInput } from '@subtracker/shared'

const { prismaMock, appendSubscriptionOrders, saveImportedLogoBufferToKey } = vi.hoisted(() => ({
  prismaMock: {
    tag: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn()
    },
    subscription: {
      createMany: vi.fn(),
      create: vi.fn()
    },
    subscriptionTag: {
      createMany: vi.fn(),
      create: vi.fn()
    }
  },
  appendSubscriptionOrders: vi.fn(async () => undefined),
  saveImportedLogoBufferToKey: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(),
  getAppTimezone: vi.fn(async () => 'Asia/Shanghai')
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  appendSubscriptionOrder: vi.fn(async () => undefined),
  appendSubscriptionOrders
}))

vi.mock('../../src/services/logo.service', () => ({
  saveImportedLogoBufferToKey,
  deleteLogoStorageObject: vi.fn()
}))

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database: vi.fn(),
  getWorkerLogoBucket: vi.fn(() => null),
  isWorkerRuntime: vi.fn(() => false)
}))

import { commitWallosImport } from '../../src/services/wallos-import.service'

describe('commitWallosImport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T00:00:00.000Z'))
    prismaMock.tag.findMany.mockReset()
    prismaMock.tag.createMany.mockReset()
    prismaMock.tag.create.mockReset()
    prismaMock.subscription.createMany.mockReset()
    prismaMock.subscription.create.mockReset()
    prismaMock.subscriptionTag.createMany.mockReset()
    prismaMock.subscriptionTag.create.mockReset()
    saveImportedLogoBufferToKey.mockReset()
    appendSubscriptionOrders.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches imported tags, subscriptions, joins, and order writes for normal imports', async () => {
    const payload: WallosImportCommitInput = {
      fileType: 'db' as const,
      preview: {
        isWallos: true as const,
        summary: {
          fileType: 'db' as const,
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
            billingIntervalUnit: 'year',
            startDate: '2025-01-10',
            nextRenewalDate: '2027-01-10',
            notifyDaysBefore: 3,
            webhookEnabled: true,
            notes: '',
            description: '',
            websiteUrl: 'https://netflix.com/',
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
            websiteUrl: 'https://spotify.com/',
            tagNames: ['Music'],
            logoRef: null,
            logoImportStatus: 'none',
            warnings: []
          }
        ],
        warnings: []
      },
      logoAssets: []
    }

    prismaMock.tag.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'tag_video', name: 'Video' },
        { id: 'tag_music', name: 'Music' }
      ])
    prismaMock.tag.createMany.mockResolvedValue({ count: 2 })
    prismaMock.subscription.createMany.mockResolvedValue({ count: 2 })
    prismaMock.subscriptionTag.createMany.mockResolvedValue({ count: 2 })

    const result = await commitWallosImport(payload)

    expect(prismaMock.tag.findMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.tag.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'Video', color: expect.any(String), sortOrder: 1 },
        { name: 'Music', color: expect.any(String), sortOrder: 2 }
      ]
    })
    expect(prismaMock.subscription.createMany).toHaveBeenCalledTimes(1)
    const createdRows = prismaMock.subscription.createMany.mock.calls[0][0].data
    const createdIds = createdRows.map((item: { id: string }) => item.id)
    expect(createdRows[0]).toMatchObject({
      currency: 'USD',
      websiteUrl: 'https://netflix.com/',
      nextRenewalDate: new Date('2027-01-09T16:00:00.000Z'),
      status: 'active',
      logoUrl: null
    })
    expect(prismaMock.subscriptionTag.createMany).toHaveBeenCalledWith({
      data: [
        { subscriptionId: createdIds[0], tagId: 'tag_video' },
        { subscriptionId: createdIds[1], tagId: 'tag_music' }
      ]
    })
    expect(appendSubscriptionOrders).toHaveBeenCalledWith(createdIds)
    expect(result).toMatchObject({
      importedTags: 2,
      importedSubscriptions: 2,
      skippedSubscriptions: 0,
      importedLogos: 0
    })
  })

  it('uploads zip logos during commit when worker R2 is enabled', async () => {
    const runtime = await import('../../src/runtime')
    vi.mocked(runtime.getWorkerLogoBucket).mockReturnValue({ put: vi.fn() } as never)
    saveImportedLogoBufferToKey.mockResolvedValue({
      logoUrl: '/static/logos/logos%2Fimports%2Fwallos%2Fabc.png',
      logoSource: 'wallos-zip'
    })

    const payload: WallosImportCommitInput = {
      fileType: 'zip' as const,
      preview: {
        isWallos: true as const,
        summary: {
          fileType: 'zip' as const,
          subscriptionsTotal: 1,
          tagsTotal: 1,
          usedTagsTotal: 1,
          supportedSubscriptions: 1,
          skippedSubscriptions: 0,
          globalNotifyDays: 3,
          zipLogoMatched: 1,
          zipLogoMissing: 0
        },
        usedTags: [{ sourceId: 1, name: 'Video', sortOrder: 1 }],
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
            billingIntervalUnit: 'year',
            startDate: '2025-01-10',
            nextRenewalDate: '2027-01-10',
            notifyDaysBefore: 3,
            webhookEnabled: true,
            notes: '',
            description: '',
            websiteUrl: 'https://netflix.com/',
            tagNames: ['Video'],
            logoRef: 'abc.png',
            logoImportStatus: 'ready-from-zip',
            warnings: []
          }
        ],
        warnings: []
      },
      logoAssets: [
        {
          logoRef: 'abc.png',
          filename: 'abc.png',
          contentType: 'image/png',
          base64: Buffer.from([137, 80, 78, 71]).toString('base64')
        }
      ]
    }

    prismaMock.tag.findMany.mockResolvedValue([{ id: 'tag_video', name: 'Video' }])
    prismaMock.subscription.createMany.mockResolvedValue({ count: 1 })
    prismaMock.subscriptionTag.createMany.mockResolvedValue({ count: 1 })

    const result = await commitWallosImport(payload)

    expect(prismaMock.subscription.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.subscription.createMany.mock.calls[0][0].data[0]).toMatchObject({
      logoUrl: '/static/logos/logos%2Fimports%2Fwallos%2Fabc.png',
      logoSource: 'wallos-zip'
    })
    expect(saveImportedLogoBufferToKey).toHaveBeenCalledTimes(1)
    expect(result.importedLogos).toBe(1)
  })
})
