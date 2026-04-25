import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, appendSubscriptionOrders } = vi.hoisted(() => ({
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
  appendSubscriptionOrders: vi.fn(async () => undefined)
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

const previewState = vi.hoisted(() => ({
  getImportPreview: vi.fn(),
  storeImportPreview: vi.fn(),
  deleteImportPreview: vi.fn()
}))

vi.mock('../../src/services/worker-lite-state.service', () => previewState)

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
    appendSubscriptionOrders.mockClear()
    previewState.getImportPreview.mockReset()
    previewState.deleteImportPreview.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches imported tags, subscriptions, joins, and order writes for normal imports', async () => {
    previewState.getImportPreview.mockResolvedValue({
      preview: {
        importToken: 'token-1',
        isWallos: true,
        summary: {
          fileType: 'db',
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
      logoManifest: {}
    })

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
    expect(previewState.deleteImportPreview).toHaveBeenCalledWith('token-1')
    expect(result).toMatchObject({
      importedTags: 2,
      importedSubscriptions: 2,
      skippedSubscriptions: 0,
      importedLogos: 0
    })
  })

  it('reuses preview-stage zip logo manifest instead of re-uploading logos during commit', async () => {
    previewState.getImportPreview.mockResolvedValue({
      preview: {
        importToken: 'token-zip',
        isWallos: true,
        summary: {
          fileType: 'zip',
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
      logoManifest: {
        'abc.png': {
          logoRef: 'abc.png',
          r2Key: 'logos/imports/wallos/token-zip/abc.png',
          logoUrl: '/static/logos/logos%2Fimports%2Fwallos%2Ftoken-zip%2Fabc.png',
          contentType: 'image/png',
          uploaded: true
        }
      }
    })

    prismaMock.tag.findMany.mockResolvedValue([{ id: 'tag_video', name: 'Video' }])
    prismaMock.subscription.createMany.mockResolvedValue({ count: 1 })
    prismaMock.subscriptionTag.createMany.mockResolvedValue({ count: 1 })

    const result = await commitWallosImport({ importToken: 'token-zip' })

    expect(prismaMock.subscription.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.subscription.createMany.mock.calls[0][0].data[0]).toMatchObject({
      logoUrl: '/static/logos/logos%2Fimports%2Fwallos%2Ftoken-zip%2Fabc.png',
      logoSource: 'wallos-zip'
    })
    expect(result.importedLogos).toBe(1)
    expect(previewState.deleteImportPreview).toHaveBeenCalledWith('token-zip')
  })
})
