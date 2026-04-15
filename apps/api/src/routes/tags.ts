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
      return sendError(reply, 422, 'validation_error', 'Invalid tag payload', parsed.error.flatten())
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
      return sendError(reply, 409, 'conflict', 'Tag update failed', error)
    }
  })

  app.delete('/tags/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid tag id')
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscriptionTag.deleteMany({
          where: { tagId: params.data.id }
        })

        await tx.tag.delete({
          where: { id: params.data.id }
        })
      })

      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch (error) {
      return sendError(reply, 404, 'not_found', 'Tag not found', error)
    }
  })
}
