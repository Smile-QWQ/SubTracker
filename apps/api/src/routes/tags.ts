import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TagSchema } from '@subtracker/shared'
import { prisma } from '../db'
import { sendCreated, sendError, sendOk } from '../http'

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', async (_request, reply) => {
    const tags = await prisma.tag.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
    return sendOk(reply, tags)
  })

  app.post('/tags', async (request, reply) => {
    const parsed = TagSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      const created = await prisma.tag.create({
        data: {
          name: parsed.data.name,
          color: parsed.data.color,
          icon: parsed.data.icon,
          sortOrder: parsed.data.sortOrder
        }
      })
      return sendCreated(reply, created)
    } catch (error) {
      return sendError(reply, 409, 'conflict', 'api.errors.tags.nameExists', error, {
        locale: request.locale
      })
    }
  })

  app.patch('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagId', undefined, {
        locale: request.locale
      })
    }

    const parsed = TagSchema.partial().refine((value) => Object.keys(value).length > 0, 'Empty update payload').safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      const updated = await prisma.tag.update({
        where: { id: params.data.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
          ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon } : {}),
          ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {})
        }
      })
      return sendOk(reply, updated)
    } catch (error) {
      return sendError(reply, 409, 'conflict', 'api.errors.tags.updateFailed', error, {
        locale: request.locale
      })
    }
  })

  app.delete('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTagId', undefined, {
        locale: request.locale
      })
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.subscriptionTag.deleteMany({
          where: { tagId: params.data.id }
        })

        await tx.tag.delete({
          where: { id: params.data.id }
        })
      })

      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch (error) {
      return sendError(reply, 404, 'not_found', 'api.errors.tags.notFound', error, {
        locale: request.locale
      })
    }
  })
}
