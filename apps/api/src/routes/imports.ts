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
      return sendError(reply, 422, 'validation_error', 'Invalid Wallos inspect payload', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await inspectWallosImportFile(parsed.data))
    } catch (error) {
      return sendError(reply, 400, 'wallos_inspect_failed', error instanceof Error ? error.message : 'Wallos inspect failed')
    }
  })

  app.post('/import/wallos/commit', async (request, reply) => {
    const parsed = WallosImportCommitSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid Wallos commit payload', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await commitWallosImport(parsed.data))
    } catch (error) {
      return sendError(reply, 400, 'wallos_commit_failed', error instanceof Error ? error.message : 'Wallos import failed')
    }
  })

  app.post('/import/subtracker/inspect', async (request, reply) => {
    const parsed = SubtrackerBackupInspectSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid SubTracker backup inspect payload', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await inspectSubtrackerBackupFile(parsed.data))
    } catch (error) {
      return sendError(
        reply,
        400,
        'subtracker_backup_inspect_failed',
        error instanceof Error ? error.message : 'SubTracker backup inspect failed'
      )
    }
  })

  app.post('/import/subtracker/commit', async (request, reply) => {
    const parsed = SubtrackerBackupCommitSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid SubTracker backup commit payload', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await commitSubtrackerBackup(parsed.data))
    } catch (error) {
      return sendError(
        reply,
        400,
        'subtracker_backup_commit_failed',
        error instanceof Error ? error.message : 'SubTracker backup restore failed'
      )
    }
  })
}
