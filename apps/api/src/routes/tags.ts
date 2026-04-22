import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TagSchema } from '@subtracker/shared'
import { sendCreated, sendError, sendOk } from '../http'
import { invalidateWorkerLiteCache, withWorkerLiteCache } from '../services/worker-lite-cache.service'
import { createTagLite, deleteTagLite, listTagsLite, updateTagLite } from '../services/worker-lite-repository.service'

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', async (_request, reply) => {
    const tags = await withWorkerLiteCache('tags', 'list', () => listTagsLite(), 30)
    return sendOk(reply, tags)
  })

  app.post('/tags', async (request, reply) => {
    const parsed = TagSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid tag payload', parsed.error.flatten())
    }

    try {
      const created = await createTagLite(parsed.data)
      await invalidateWorkerLiteCache(['tags', 'subscriptions', 'statistics'])
      return sendCreated(reply, created)
    } catch (error) {
      return sendError(reply, 409, 'conflict', 'Tag name already exists', error)
    }
  })

  app.patch('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid tag id')
    }

    const parsed = TagSchema.partial().refine((value) => Object.keys(value).length > 0, 'Empty update payload').safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid tag payload', parsed.error.flatten())
    }

    try {
      const updated = await updateTagLite(params.data.id, parsed.data)
      await invalidateWorkerLiteCache(['tags', 'subscriptions', 'statistics'])
      return sendOk(reply, updated)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tag update failed'
      return sendError(
        reply,
        message === 'Tag not found' ? 404 : 409,
        message === 'Tag not found' ? 'not_found' : 'conflict',
        message,
        error
      )
    }
  })

  app.delete('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid tag id')
    }

    try {
      await deleteTagLite(params.data.id)
      await invalidateWorkerLiteCache(['tags', 'subscriptions', 'statistics'])
      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch (error) {
      return sendError(reply, 404, 'not_found', 'Tag not found', error)
    }
  })
}
