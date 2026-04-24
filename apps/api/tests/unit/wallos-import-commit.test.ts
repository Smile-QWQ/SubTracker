import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, appendSubscriptionOrdersMock, appendSubscriptionOrderMock, replaceSubscriptionTagsMock, saveImportedLogoBufferMock } =
  vi.hoisted(() => ({
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
    appendSubscriptionOrdersMock: vi.fn(async () => undefined),
    appendSubscriptionOrderMock: vi.fn(async () => undefined),
    replaceSubscriptionTagsMock: vi.fn(async () => undefined),
    saveImportedLogoBufferMock: vi.fn()
  }))

vi.mock('../../src/db', () => ({
  prisma: prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    defaultNotifyDays: 3,
    baseCurrency: 'CNY'
  }))
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  appendSubscriptionOrder: appendSubscriptionOrderMock,
  appendSubscriptionOrders: appendSubscriptionOrdersMock
}))

vi.mock('../../src/services/tag.service', () => ({
  replaceSubscriptionTags: replaceSubscriptionTagsMock
}))

vi.mock('../../src/services/logo.service', () => ({
  saveImportedLogoBuffer: saveImportedLogoBufferMock
}))

import { commitWallosImport, inspectWallosImportFile } from '../../src/services/wallos-import.service'

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

describe('commitWallosImport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T00:00:00.000Z'))
    prismaMock.tag.findMany.mockReset()
    prismaMock.tag.createMany.mockReset()
    prismaMock.subscription.createMany.mockReset()
    prismaMock.subscriptionTag.createMany.mockReset()
    appendSubscriptionOrdersMock.mockReset()
    appendSubscriptionOrderMock.mockReset()
    replaceSubscriptionTagsMock.mockReset()
    saveImportedLogoBufferMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches imported tags, subscriptions, tag joins, and order writes', async () => {
    const preview = await inspectWallosImportFile({
      filename: 'wallos.json',
      contentType: 'application/json',
      base64: encodeJson([
        {
          ID: 1,
          Type: 'Subscription',
          Name: 'Netflix',
          Price: '$10',
          Category: 'Video',
          'Payment Cycle': 'Yearly',
          'Next Payment': '2025-01-10',
          Renewal: 'Automatic',
          URL: 'netflix.com',
          Notes: ''
        },
        {
          ID: 2,
          Type: 'Subscription',
          Name: 'Spotify',
          Price: '$15',
          Category: 'Music',
          'Payment Cycle': 'Monthly',
          'Next Payment': '2026-05-02',
          URL: 'https://spotify.com',
          Notes: ''
        }
      ])
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

    const result = await commitWallosImport({ importToken: preview.importToken })

    expect(prismaMock.tag.findMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.tag.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'Video', color: '#ef4444', sortOrder: 1 },
        { name: 'Music', color: '#ef4444', sortOrder: 2 }
      ]
    })
    expect(prismaMock.subscription.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.subscription.createMany.mock.calls[0][0].data).toHaveLength(2)
    const createdRows = prismaMock.subscription.createMany.mock.calls[0][0].data
    const createdIds = createdRows.map((item: { id: string }) => item.id)
    expect(createdRows[0]).toMatchObject({
      currency: 'USD',
      websiteUrl: 'https://netflix.com/',
      nextRenewalDate: new Date('2027-01-10T00:00:00.000Z'),
      status: 'active'
    })
    expect(prismaMock.subscriptionTag.createMany).toHaveBeenCalledWith({
      data: [
        { subscriptionId: createdIds[0], tagId: 'tag_video' },
        { subscriptionId: createdIds[1], tagId: 'tag_music' }
      ]
    })
    expect(appendSubscriptionOrdersMock).toHaveBeenCalledTimes(1)
    expect(appendSubscriptionOrdersMock).toHaveBeenCalledWith(createdIds)
    expect(appendSubscriptionOrderMock).not.toHaveBeenCalled()
    expect(replaceSubscriptionTagsMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      importedTags: 2,
      importedSubscriptions: 2,
      skippedSubscriptions: 0
    })
  })
})
