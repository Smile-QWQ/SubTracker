import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  inspectWallosImportFileMock: vi.fn(),
  commitWallosImportMock: vi.fn(),
  inspectSubtrackerBackupFileMock: vi.fn(),
  commitSubtrackerBackupMock: vi.fn(),
  invalidateWorkerLiteCacheMock: vi.fn(async () => undefined),
  bumpCacheVersionsMock: vi.fn(async () => 0)
}))

vi.mock('../../src/services/wallos-import.service', () => ({
  inspectWallosImportFile: routeMocks.inspectWallosImportFileMock,
  commitWallosImport: routeMocks.commitWallosImportMock
}))

vi.mock('../../src/services/subtracker-backup.service', () => ({
  inspectSubtrackerBackupFile: routeMocks.inspectSubtrackerBackupFileMock,
  commitSubtrackerBackup: routeMocks.commitSubtrackerBackupMock
}))

vi.mock('../../src/services/worker-lite-cache.service', () => ({
  invalidateWorkerLiteCache: routeMocks.invalidateWorkerLiteCacheMock
}))

vi.mock('../../src/services/cache-version.service', () => ({
  bumpCacheVersions: routeMocks.bumpCacheVersionsMock
}))

import { importRoutes } from '../../src/routes/imports'

describe('import routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await importRoutes(app)
    routeMocks.inspectWallosImportFileMock.mockReset()
    routeMocks.commitWallosImportMock.mockReset()
    routeMocks.inspectSubtrackerBackupFileMock.mockReset()
    routeMocks.commitSubtrackerBackupMock.mockReset()
    routeMocks.invalidateWorkerLiteCacheMock.mockReset()
    routeMocks.bumpCacheVersionsMock.mockReset()
  })

  afterEach(async () => {
    await app.close()
  })

  it('accepts subtracker backup inspect payloads', async () => {
    routeMocks.inspectSubtrackerBackupFileMock.mockResolvedValue({
      isSubtrackerBackup: true,
      summary: {
        scope: 'business-complete',
        subscriptionsTotal: 1,
        tagsTotal: 1,
        paymentRecordsTotal: 0,
        logosTotal: 0,
        includesSettings: true
      },
      warnings: [],
      availableModes: ['replace', 'append'],
      conflicts: {
        existingTagNameCount: 0,
        existingSubscriptionIdCount: 0,
        existingPaymentRecordIdCount: 0,
        canRestoreSettings: true
      }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/inspect',
      payload: {
        filename: 'subtracker-backup.zip',
        manifest: {
          app: 'SubTracker'
        },
        logoAssets: []
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.inspectSubtrackerBackupFileMock).toHaveBeenCalledWith({
      filename: 'subtracker-backup.zip',
      manifest: {
        app: 'SubTracker'
      },
      logoAssets: []
    })
  })

  it('accepts subtracker backup commit payloads', async () => {
    routeMocks.commitSubtrackerBackupMock.mockResolvedValue({
      mode: 'append',
      clearedExistingData: false,
      restoredSettings: true,
      importedTags: 1,
      reusedTags: 1,
      importedSubscriptions: 1,
      skippedSubscriptions: 0,
      importedPaymentRecords: 0,
      skippedPaymentRecords: 0,
      importedLogos: 0,
      warnings: []
    })

    const payload = {
      manifest: {
        schemaVersion: 1,
        exportedAt: '2026-05-01T00:00:00.000Z',
        app: 'SubTracker',
        scope: 'business-complete',
        data: {
          settings: {},
          notificationWebhook: {},
          tags: [],
          subscriptions: [],
          paymentRecords: [],
          subscriptionOrder: []
        },
        assets: {
          logos: []
        }
      },
      logoAssets: [
        {
          path: 'logos/test.png',
          filename: 'test.png',
          contentType: 'image/png',
          base64: 'ZmFrZQ=='
        }
      ],
      mode: 'append' as const,
      restoreSettings: true
    }

    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/commit',
      payload
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.commitSubtrackerBackupMock).toHaveBeenCalledWith(payload)
    expect(routeMocks.invalidateWorkerLiteCacheMock).toHaveBeenCalledWith([
      'subscriptions',
      'tags',
      'statistics',
      'calendar',
      'settings',
      'exchange-rates'
    ])
    expect(routeMocks.bumpCacheVersionsMock).toHaveBeenCalledWith(['statistics', 'calendar', 'settings', 'exchangeRates'])
  })

  it('skips import cache side effects for append no-op commits', async () => {
    routeMocks.commitSubtrackerBackupMock.mockResolvedValue({
      mode: 'append',
      clearedExistingData: false,
      restoredSettings: false,
      importedTags: 0,
      reusedTags: 20,
      importedSubscriptions: 0,
      skippedSubscriptions: 100,
      importedPaymentRecords: 0,
      skippedPaymentRecords: 1000,
      importedLogos: 0,
      warnings: []
    })

    const payload = {
      manifest: {
        schemaVersion: 1,
        exportedAt: '2026-05-01T00:00:00.000Z',
        app: 'SubTracker',
        scope: 'business-complete',
        data: {
          settings: {},
          notificationWebhook: {},
          tags: [],
          subscriptions: [],
          paymentRecords: [],
          subscriptionOrder: []
        },
        assets: {
          logos: []
        }
      },
      logoAssets: [],
      mode: 'append' as const,
      restoreSettings: false
    }

    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/commit',
      payload
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.invalidateWorkerLiteCacheMock).not.toHaveBeenCalled()
    expect(routeMocks.bumpCacheVersionsMock).not.toHaveBeenCalled()
  })

  it('rejects invalid subtracker backup commit payloads', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/commit',
      payload: {
        mode: 'invalid-mode'
      }
    })

    expect(res.statusCode).toBe(422)
    expect(routeMocks.commitSubtrackerBackupMock).not.toHaveBeenCalled()
  })

  it('accepts wallos inspect payloads', async () => {
    routeMocks.inspectWallosImportFileMock.mockResolvedValue({
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
      tags: [],
      usedTags: [],
      subscriptionsPreview: [],
      warnings: []
    })

    const res = await app.inject({
      method: 'POST',
      url: '/import/wallos/inspect',
      payload: {
        filename: 'wallos.zip',
        fileType: 'zip',
        preview: {
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
          tags: [],
          usedTags: [],
          subscriptionsPreview: [],
          warnings: []
        },
        logoAssets: []
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.inspectWallosImportFileMock).toHaveBeenCalledTimes(1)
  })

  it('accepts wallos commit payloads', async () => {
    routeMocks.commitWallosImportMock.mockResolvedValue({
      importedTags: 1,
      importedSubscriptions: 1,
      skippedSubscriptions: 0,
      importedLogos: 0,
      warnings: []
    })

    const payload = {
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
            status: 'active',
            autoRenew: true,
            billingIntervalCount: 1,
            billingIntervalUnit: 'month',
            startDate: '2026-04-01',
            nextRenewalDate: '2026-05-01',
            notifyDaysBefore: 3,
            webhookEnabled: false,
            notes: '',
            description: '',
            websiteUrl: 'https://example.com',
            tagNames: ['Video'],
            logoRef: null,
            logoImportStatus: 'none',
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
          base64: 'ZmFrZQ=='
        }
      ]
    }

    const res = await app.inject({
      method: 'POST',
      url: '/import/wallos/commit',
      payload: {
        fileType: payload.fileType,
        preview: payload.preview,
        logoAssets: payload.logoAssets
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.commitWallosImportMock).toHaveBeenCalledWith({
      fileType: 'zip',
      preview: payload.preview,
      logoAssets: payload.logoAssets
    })
  })
})
