import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import {
  SubtrackerBackupCommitSchema,
  SubtrackerBackupInspectSchema,
  WallosImportCommitSchema,
  WallosImportInspectSchema
} from '@subtracker/shared'
import { bumpCacheVersions } from '../services/cache-version.service'
import { commitSubtrackerBackup, inspectSubtrackerBackupFile } from '../services/subtracker-backup.service'
import { invalidateWorkerLiteCache } from '../services/worker-lite-cache.service'
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
      const result = await commitWallosImport(parsed.data)
      await Promise.all([
        invalidateWorkerLiteCache(['subscriptions', 'tags', 'statistics', 'calendar']),
        bumpCacheVersions(['statistics', 'calendar'])
      ])
      return sendOk(reply, result)
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
      const result = await commitSubtrackerBackup(parsed.data)
      await Promise.all([
        invalidateWorkerLiteCache(['subscriptions', 'tags', 'statistics', 'calendar', 'settings', 'exchange-rates']),
        bumpCacheVersions(['statistics', 'calendar', 'settings', 'exchangeRates'])
      ])
      return sendOk(reply, result)
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
