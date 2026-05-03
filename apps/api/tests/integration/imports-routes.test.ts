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
      importToken: '0123456789abcdef',
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

    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/commit',
      payload: {
        importToken: '0123456789abcdef',
        mode: 'append',
        restoreSettings: true
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.commitSubtrackerBackupMock).toHaveBeenCalledWith({
      importToken: '0123456789abcdef',
      mode: 'append',
      restoreSettings: true
    })
  })

  it('rejects invalid subtracker backup commit payloads', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/commit',
      payload: {
        importToken: 'short'
      }
    })

    expect(res.statusCode).toBe(422)
    expect(routeMocks.commitSubtrackerBackupMock).not.toHaveBeenCalled()
  })
})
