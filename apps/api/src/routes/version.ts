import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendError, sendOk } from '../http'
import { getVersionUpdateSummary } from '../services/version-update.service'

export async function versionRoutes(app: FastifyInstance) {
  app.get('/version/updates', async (request, reply) => {
    const parsed = z
      .object({
        currentVersion: z.string().min(1).max(50)
      })
      .safeParse(request.query)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid currentVersion query', parsed.error.flatten())
    }

    try {
      const summary = await getVersionUpdateSummary(parsed.data.currentVersion)
      return sendOk(reply, summary)
    } catch (error) {
      return sendError(reply, 502, 'version_update_fetch_failed', error instanceof Error ? error.message : 'Failed to fetch releases')
    }
  })
}
