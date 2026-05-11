import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import {
  SubtrackerBackupCommitSchema,
  SubtrackerBackupInspectSchema,
  WallosImportCommitSchema,
  WallosImportInspectSchema
} from '@subtracker/shared'
import { commitSubtrackerBackup, inspectSubtrackerBackupFile } from '../services/subtracker-backup.service'
import { commitWallosImport, inspectWallosImportFile } from '../services/wallos-import.service'

export async function importRoutes(app: FastifyInstance) {
  app.post('/import/wallos/inspect', async (request, reply) => {
    const parsed = WallosImportInspectSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidWallosInspectPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await inspectWallosImportFile(parsed.data))
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
      return sendOk(reply, await commitWallosImport(parsed.data))
    } catch (error) {
      return sendError(reply, 400, 'wallos_commit_failed', error instanceof Error ? error.message : 'api.errors.imports.wallosCommitFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/import/subtracker/inspect', async (request, reply) => {
    const parsed = SubtrackerBackupInspectSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubtrackerBackupInspectPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await inspectSubtrackerBackupFile(parsed.data))
    } catch (error) {
      return sendError(
        reply,
        400,
        'subtracker_backup_inspect_failed',
        error instanceof Error ? error.message : 'api.errors.imports.subtrackerBackupInspectFailed',
        undefined,
        { locale: request.locale }
      )
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
      return sendOk(reply, await commitSubtrackerBackup(parsed.data))
    } catch (error) {
      return sendError(
        reply,
        400,
        'subtracker_backup_commit_failed',
        error instanceof Error ? error.message : 'api.errors.imports.subtrackerBackupCommitFailed',
        undefined,
        { locale: request.locale }
      )
    }
  })
}
