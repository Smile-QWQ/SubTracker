import { FastifyInstance, FastifyReply } from 'fastify'
import { performance } from 'node:perf_hooks'
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

type ImportRouteTraceStep = {
  step: string
  wallMs: number
  [key: string]: unknown
}

function isImportRouteTraceEnabled() {
  return process.env.SUBTRACKER_PERF_TRACE === '1'
}

function readImportRouteTraceHeader(header: string | string[] | undefined) {
  if (Array.isArray(header)) {
    return header.some((value) => value === '1')
  }
  return header === '1'
}

function createImportRouteTrace(forceEnabled = false) {
  return forceEnabled || isImportRouteTraceEnabled() ? [] as ImportRouteTraceStep[] : null
}

async function traceImportRouteStep<T>(
  trace: ImportRouteTraceStep[] | null,
  step: string,
  run: () => Promise<T> | T,
  describe?: (value: T) => Record<string, unknown>
) {
  if (!trace) {
    return run()
  }

  const startedAt = performance.now()
  const value = await run()
  const wallMs = Number((performance.now() - startedAt).toFixed(2))
  trace.push({
    step,
    wallMs,
    ...(describe ? describe(value) : {})
  })
  return value
}

function emitImportRouteTrace(
  trace: ImportRouteTraceStep[] | null,
  extra?: Record<string, unknown>
) {
  if (!trace) {
    return
  }

  console.info(
    JSON.stringify({
      target: 'subtracker-backup-commit-route',
      trace,
      ...extra
    })
  )
}

function attachImportRouteTraceHeader(reply: FastifyReply, trace: ImportRouteTraceStep[] | null) {
  if (!trace || trace.length === 0) {
    return
  }
  reply.header('x-subtracker-perf-trace', JSON.stringify(trace))
}

function isAppendImportNoop(result: {
  mode: string
  restoredSettings: boolean
  importedTags: number
  importedSubscriptions: number
  importedPaymentRecords: number
  importedLogos: number
}) {
  return result.mode === 'append' &&
    !result.restoredSettings &&
    result.importedTags === 0 &&
    result.importedSubscriptions === 0 &&
    result.importedPaymentRecords === 0 &&
    result.importedLogos === 0
}

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
    const traceEnabled = readImportRouteTraceHeader(request.headers['x-subtracker-perf-trace'])
    const routeTrace = createImportRouteTrace(traceEnabled)
    const parsed = await traceImportRouteStep(
      routeTrace,
      'schema-parse',
      () => SubtrackerBackupCommitSchema.safeParse(request.body),
      (value) => ({
        success: value.success
      })
    )
    if (!parsed.success) {
      emitImportRouteTrace(routeTrace, {
        outcome: 'validation_error'
      })
      return sendError(reply, 422, 'validation_error', 'Invalid SubTracker backup commit payload', parsed.error.flatten())
    }

    try {
      let serviceTraceSteps: unknown = null
      const result = await traceImportRouteStep(
        routeTrace,
        'commit-subtracker-backup',
        () =>
          routeTrace
            ? commitSubtrackerBackup(parsed.data, {
                traceEnabled: true,
                onTrace: (steps) => {
                  serviceTraceSteps = steps
                }
              })
            : commitSubtrackerBackup(parsed.data),
        (value) => ({
          mode: value.mode,
          importedSubscriptions: value.importedSubscriptions,
          importedPaymentRecords: value.importedPaymentRecords,
          importedTags: value.importedTags
        })
      )
      if (!isAppendImportNoop(result)) {
        await traceImportRouteStep(routeTrace, 'invalidate-worker-lite-cache', () =>
          invalidateWorkerLiteCache(['subscriptions', 'tags', 'statistics', 'calendar', 'settings', 'exchange-rates'])
        )
        await traceImportRouteStep(routeTrace, 'bump-cache-versions', () =>
          bumpCacheVersions(['statistics', 'calendar', 'settings', 'exchangeRates'])
        )
      }
      attachImportRouteTraceHeader(reply, routeTrace)
      if (Array.isArray(serviceTraceSteps) && serviceTraceSteps.length > 0) {
        reply.header('x-subtracker-service-trace', JSON.stringify(serviceTraceSteps))
      }
      const response = await traceImportRouteStep(routeTrace, 'send-ok', () => Promise.resolve(sendOk(reply, result)))
      emitImportRouteTrace(routeTrace, {
        outcome: 'ok'
      })
      return response
    } catch (error) {
      emitImportRouteTrace(routeTrace, {
        outcome: 'error',
        error: error instanceof Error ? error.message : 'SubTracker backup restore failed'
      })
      return sendError(
        reply,
        400,
        'subtracker_backup_commit_failed',
        error instanceof Error ? error.message : 'SubTracker backup restore failed'
      )
    }
  })
}
