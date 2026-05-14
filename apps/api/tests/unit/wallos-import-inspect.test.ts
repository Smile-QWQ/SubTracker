import { beforeEach, describe, expect, it, vi } from 'vitest'

const { saveImportedLogoBufferToKey } = vi.hoisted(() => ({
  saveImportedLogoBufferToKey: vi.fn()
}))

const runtimeState = vi.hoisted(() => ({
  getWorkerLogoBucket: vi.fn(),
  isWorkerRuntime: vi.fn(() => true)
}))

vi.mock('../../src/services/logo.service', () => ({
  saveImportedLogoBufferToKey,
  deleteLogoStorageObject: vi.fn()
}))

vi.mock('../../src/runtime', () => runtimeState)

vi.mock('../../src/db', () => ({
  prisma: {}
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  appendSubscriptionOrders: vi.fn()
}))

import { inspectWallosImportFile } from '../../src/services/wallos-import.service'

function buildPreparedPayload() {
  return {
    filename: 'wallos-backup.zip',
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
      tags: [{ sourceId: 1, name: 'Video', sortOrder: 1 }],
      usedTags: [{ sourceId: 1, name: 'Video', sortOrder: 1 }],
      subscriptionsPreview: [
        {
          sourceId: 1,
          name: 'Netflix',
          amount: 10,
          currency: 'USD',
          status: 'active' as const,
          autoRenew: true,
          billingIntervalCount: 1,
          billingIntervalUnit: 'year' as const,
          startDate: '2025-01-10',
          nextRenewalDate: '2027-01-10',
          notifyDaysBefore: 3,
          webhookEnabled: true,
          notes: '',
          description: '',
          websiteUrl: 'https://netflix.com/',
          tagNames: ['Video'],
          logoRef: 'abc.png',
          logoImportStatus: 'ready-from-zip' as const,
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
}

describe('inspectWallosImportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores prepared preview and downgrades zip logos when worker R2 is unavailable', async () => {
    runtimeState.getWorkerLogoBucket.mockReturnValue(null)

    const result = await inspectWallosImportFile(buildPreparedPayload())

    expect(result.summary.fileType).toBe('zip')
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('当前 Worker 未启用 R2')]))
    expect(result.subscriptionsPreview[0]).toMatchObject({
      logoRef: null,
      logoImportStatus: 'none'
    })
    expect(saveImportedLogoBufferToKey).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('importToken')
  })

  it('does not upload prepared zip logo assets during inspect even when worker R2 is enabled', async () => {
    runtimeState.getWorkerLogoBucket.mockReturnValue({ put: vi.fn() })
    saveImportedLogoBufferToKey.mockResolvedValue({
      logoUrl: '/static/logos/token/abc.png',
      logoSource: 'wallos-zip'
    })

    const result = await inspectWallosImportFile(buildPreparedPayload())

    expect(saveImportedLogoBufferToKey).not.toHaveBeenCalled()
    expect(result.subscriptionsPreview[0]).toMatchObject({
      logoRef: 'abc.png',
      logoImportStatus: 'ready-from-zip'
    })
  })
})
