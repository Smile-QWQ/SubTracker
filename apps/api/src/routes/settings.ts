import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import { getAppSettings, setSetting } from '../services/settings.service'
import { SettingsSchema } from '@subtracker/shared'

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', async (_, reply) => {
    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })

  app.patch('/settings', async (request, reply) => {
    const parsed = SettingsSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid settings payload', parsed.error.flatten())
    }

    await Promise.all(
      Object.entries(parsed.data).map(([key, value]) => {
        return value === undefined ? Promise.resolve() : setSetting(key, value)
      })
    )

    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })
}
