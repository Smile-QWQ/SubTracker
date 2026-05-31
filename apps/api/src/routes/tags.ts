import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TagSchema } from '@subtracker/shared'
import { sendCreated, sendError, sendOk } from '../http'
import { bumpCacheVersions } from '../services/cache-version.service'
import { invalidateWorkerLiteCache, withWorkerLiteCache } from '../services/worker-lite-cache.service'
import { createTagLite, deleteTagLite, listTagsLite, updateTagLite } from '../services/worker-lite-repository.service'

const TAG_UPDATE_EMPTY_PAYLOAD_MESSAGE = 'api.errors.validation.invalidTagPayload'

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', async (_request, reply) => {
    const tags = await withWorkerLiteCache('tags', 'list', () => listTagsLite(), 30)
    return sendOk(reply, tags)
  })

  app.post('/tags', async (request, reply) => {
    const parsed = TagSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagPayload', parsed.error.flatten())
    }

    try {
      const created = await createTagLite(parsed.data)
      await Promise.all([
        invalidateWorkerLiteCache(['tags', 'subscriptions', 'statistics']),
        bumpCacheVersions(['statistics'])
      ])
      return sendCreated(reply, created)
    } catch (error) {
      return sendError(reply, 409, 'conflict', 'api.errors.tags.nameExists', error)
    }
  })

  app.patch('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagId')
    }

    const parsed = TagSchema.partial()
      .refine((value) => Object.keys(value).length > 0, TAG_UPDATE_EMPTY_PAYLOAD_MESSAGE)
      .safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagPayload', parsed.error.flatten())
    }

    try {
      const updated = await updateTagLite(params.data.id, parsed.data)
      await Promise.all([
        invalidateWorkerLiteCache(['tags', 'subscriptions', 'statistics']),
        bumpCacheVersions(['statistics'])
      ])
      return sendOk(reply, updated)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'api.errors.tags.updateFailed'
      return sendError(
        reply,
        message === 'api.errors.tags.notFound' ? 404 : 409,
        message === 'api.errors.tags.notFound' ? 'not_found' : 'conflict',
        message,
        error
      )
    }
  })

  app.delete('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagId')
    }

    try {
      await deleteTagLite(params.data.id)
      await Promise.all([
        invalidateWorkerLiteCache(['tags', 'subscriptions', 'statistics']),
        bumpCacheVersions(['statistics'])
      ])
      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch (error) {
      return sendError(reply, 404, 'not_found', 'api.errors.tags.notFound', error)
    }
  })
}
