import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import { WallosImportCommitSchema, WallosImportInspectSchema } from '@subtracker/shared'
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
}
