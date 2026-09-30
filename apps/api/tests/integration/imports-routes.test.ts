import Fastify, { type FastifyInstance } from 'fastify'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  inspectWallosImportFileMock: vi.fn(),
  commitWallosImportMock: vi.fn(),
  inspectSubtrackerBackupFileMock: vi.fn(),
  commitSubtrackerBackupMock: vi.fn(),
  discardSubtrackerBackupMock: vi.fn()
}))

vi.mock('../../src/services/wallos-import.service', () => ({
  inspectWallosImportFile: routeMocks.inspectWallosImportFileMock,
  commitWallosImport: routeMocks.commitWallosImportMock
}))

vi.mock('../../src/services/subtracker-backup.service', () => ({
  inspectSubtrackerBackupFile: routeMocks.inspectSubtrackerBackupFileMock,
  commitSubtrackerBackup: routeMocks.commitSubtrackerBackupMock,
  discardSubtrackerBackup: routeMocks.discardSubtrackerBackupMock,
  BackupBusyError: class extends Error {}
}))

import { importRoutes } from '../../src/routes/imports'
import { BackupLimitError } from '../../src/utils/streaming-zip'

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
    app.server.closeAllConnections()
    await app.close()
  })

  it('returns a readable 413 over a real chunked HTTP upload instead of resetting the socket', async () => {
    routeMocks.inspectSubtrackerBackupFileMock.mockImplementation(async (source: Readable) => {
      let bytes = 0
      for await (const chunk of source.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length
        if (bytes > 1024 * 1024) throw new BackupLimitError('Backup size limit exceeded')
      }
    })
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    const response = await fetch(`${address}/import/subtracker/inspect`, {
      method: 'POST', headers: { 'content-type': 'application/zip' },
      body: Readable.from([Buffer.alloc(1024 * 1024), Buffer.alloc(1024 * 1024), Buffer.alloc(1024 * 1024)]) as never,
      duplex: 'half'
    } as RequestInit)
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'backup_too_large' } })
  })

  it('passes raw ZIP uploads as streams with a session owner and cancellation signal', async () => {
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
      headers: { 'content-type': 'application/zip' },
      payload: Buffer.from('ZIP')
    })

    expect(res.statusCode).toBe(200)
    expect(routeMocks.inspectSubtrackerBackupFileMock).toHaveBeenCalledWith(expect.any(Readable), undefined, expect.any(String), expect.any(AbortSignal))
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
    }, undefined, expect.any(String))
  })

  it('keeps subtracker backup commit response shape stable for frontend consumers', async () => {
    routeMocks.commitSubtrackerBackupMock.mockResolvedValue({
      mode: 'append',
      clearedExistingData: false,
      restoredSettings: false,
      importedTags: 0,
      reusedTags: 2,
      importedSubscriptions: 0,
      skippedSubscriptions: 1,
      importedPaymentRecords: 0,
      skippedPaymentRecords: 1,
      importedLogos: 0,
      warnings: ['append no-op']
    })

    const res = await app.inject({
      method: 'POST',
      url: '/import/subtracker/commit',
      payload: {
        importToken: '0123456789abcdef',
        mode: 'append',
        restoreSettings: false
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      data: {
        mode: 'append',
        clearedExistingData: false,
        restoredSettings: false,
        importedTags: 0,
        reusedTags: 2,
        importedSubscriptions: 0,
        skippedSubscriptions: 1,
        importedPaymentRecords: 0,
        skippedPaymentRecords: 1,
        importedLogos: 0,
        warnings: ['append no-op']
      }
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
