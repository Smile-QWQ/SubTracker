import { FastifyInstance } from 'fastify'
import { SetAppLocaleSchema } from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { getResolvedAppLocale, setAppLocale } from '../services/settings.service'

export async function appRoutes(app: FastifyInstance) {
  app.get('/app/locale', async (_request, reply) => {
    return sendOk(reply, {
      locale: await getResolvedAppLocale()
    })
  })

  app.put('/app/locale', async (request, reply) => {
    const parsed = SetAppLocaleSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSettingsPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    const locale = await setAppLocale(parsed.data.locale)
    return sendOk(reply, { locale })
  })
}
