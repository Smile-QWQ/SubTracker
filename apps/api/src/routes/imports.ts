import { FastifyInstance } from 'fastify'
import { Readable } from 'node:stream'
import crypto from 'node:crypto'
import { sendError, sendOk } from '../http'
import {
  SubtrackerBackupCommitSchema,
  WallosImportCommitSchema,
  WallosImportInspectSchema
} from '@subtracker/shared'
import { BackupBusyError, commitSubtrackerBackup, discardSubtrackerBackup, inspectSubtrackerBackupFile } from '../services/subtracker-backup.service'
import { getBackupLimits } from '../services/backup-files.service'
import { BackupLimitError } from '../utils/streaming-zip'
import { commitWallosImport, inspectWallosImportFile } from '../services/wallos-import.service'

export async function importRoutes(app: FastifyInstance) {
  const owner = (authorization?: string) => crypto.createHash('sha256').update(authorization ?? '').digest('hex')
  app.addContentTypeParser(['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], (_request, payload, done) => done(null, payload))
  app.get('/import/subtracker/limits', async (_request, reply) => {
    const { maxArchiveBytes, maxExpandedBytes } = getBackupLimits()
    return sendOk(reply, { maxArchiveBytes, maxExpandedBytes })
  })
  app.delete('/import/subtracker/:token', async (request, reply) => {
    await discardSubtrackerBackup((request.params as { token: string }).token, owner(request.headers.authorization))
    return sendOk(reply, { deleted: true })
  })
  app.post('/import/wallos/inspect', async (request, reply) => {
    const parsed = WallosImportInspectSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidWallosInspectPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await inspectWallosImportFile(parsed.data, request.locale))
    } catch (error) {
      return sendError(reply, 400, 'wallos_inspect_failed', error instanceof Error ? error.message : 'api.errors.imports.wallosInspectFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/import/wallos/commit', async (request, reply) => {
    const parsed = WallosImportCommitSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidWallosCommitPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await commitWallosImport(parsed.data, request.locale))
    } catch (error) {
      return sendError(reply, 400, 'wallos_commit_failed', error instanceof Error ? error.message : 'api.errors.imports.wallosCommitFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/import/subtracker/inspect', {
    bodyLimit: getBackupLimits().maxArchiveBytes,
    errorHandler(error, request, reply) {
      if (error.statusCode === 413) {
        return sendError(reply, 413, 'backup_too_large', 'api.errors.imports.subtrackerBackupTooLarge', undefined, { locale: request.locale })
      }
      throw error
    }
  }, async (request, reply) => {
    const source = request.body
    if (!(source instanceof Readable)) return sendError(reply, 415, 'zip_required', 'api.errors.imports.subtrackerBackupZipRequired', undefined, { locale: request.locale })
    const controller = new AbortController()
    const onClose = () => { if (!reply.raw.writableFinished) controller.abort() }
    reply.raw.once('close', onClose)
    const sessionOwner = owner(request.headers.authorization)
    try {
      if (Number(request.headers['content-length'] ?? 0) > getBackupLimits().maxArchiveBytes) throw new BackupLimitError('Backup size limit exceeded')
      const preview = await inspectSubtrackerBackupFile(source, request.locale, sessionOwner, controller.signal)
      if (controller.signal.aborted || reply.raw.destroyed) {
        await discardSubtrackerBackup(preview.importToken, sessionOwner)
        return
      }
      return sendOk(reply, preview)
    } catch (error) {
      if (controller.signal.aborted) return
      // Drain briefly so clients receive the error before their upload socket
      // closes. Immediate destruction (even on reply finish) can cause ECONNRESET.
      if (!source.readableEnded) {
        const drainTimer = setTimeout(() => source.destroy(), 5000)
        drainTimer.unref()
        const clearDrain = () => {
          clearTimeout(drainTimer)
          source.off('end', clearDrain)
          source.off('close', clearDrain)
        }
        source.once('end', clearDrain)
        source.once('close', clearDrain)
        source.resume()
      }
      const limited = error instanceof BackupLimitError
      const busy = error instanceof BackupBusyError
      return sendError(reply, limited ? 413 : busy ? 409 : 400, limited ? 'backup_too_large' : 'subtracker_backup_inspect_failed',
        limited ? 'api.errors.imports.subtrackerBackupTooLarge' : busy ? 'api.errors.imports.subtrackerBackupBusy' : 'api.errors.imports.subtrackerBackupInspectFailed', undefined, { locale: request.locale })
    } finally {
      reply.raw.removeListener('close', onClose)
    }
  })

  app.post('/import/subtracker/commit', async (request, reply) => {
    const parsed = SubtrackerBackupCommitSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubtrackerBackupCommitPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await commitSubtrackerBackup(parsed.data, request.locale, owner(request.headers.authorization)))
    } catch (error) {
      return sendError(
        reply,
        400,
        'subtracker_backup_commit_failed',
        error instanceof BackupBusyError ? 'api.errors.imports.subtrackerBackupBusy' : 'api.errors.imports.subtrackerBackupCommitFailed',
        undefined,
        { locale: request.locale }
      )
    }
  })
}
