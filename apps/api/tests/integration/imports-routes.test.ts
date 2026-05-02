import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  inspectWallosImportFileMock: vi.fn(),
  commitWallosImportMock: vi.fn(),
  inspectSubtrackerBackupFileMock: vi.fn(),
  commitSubtrackerBackupMock: vi.fn()
}))

vi.mock('../../src/services/wallos-import.service', () => ({
  inspectWallosImportFile: routeMocks.inspectWallosImportFileMock,
  commitWallosImport: routeMocks.commitWallosImportMock
}))

vi.mock('../../src/services/subtracker-backup.service', () => ({
  inspectSubtrackerBackupFile: routeMocks.inspectSubtrackerBackupFileMock,
  commitSubtrackerBackup: routeMocks.commitSubtrackerBackupMock
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
        contentType: 'application/zip',
        base64: 'ZmFrZQ=='
      }
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.inspectSubtrackerBackupFileMock).toHaveBeenCalledWith({
      filename: 'subtracker-backup.zip',
      contentType: 'application/zip',
      base64: 'ZmFrZQ=='
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
