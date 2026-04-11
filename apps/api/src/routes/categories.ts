import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendCreated, sendError, sendOk } from '../http'
import { CategorySchema } from '@subtracker/shared'

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/categories', async (_, reply) => {
    const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
    return sendOk(reply, categories)
  })

  app.post('/categories', async (request, reply) => {
    const parsed = CategorySchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid category payload', parsed.error.flatten())
    }

    try {
      const created = await prisma.category.create({
        data: {
          name: parsed.data.name,
          color: parsed.data.color,
          icon: parsed.data.icon,
          sortOrder: parsed.data.sortOrder
        }
      })
      return sendCreated(reply, created)
    } catch (error) {
      return sendError(reply, 409, 'conflict', 'Category name already exists', error)
    }
  })

  app.patch('/categories/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid category id')
    }

    const parsed = CategorySchema.partial()
      .refine((value) => Object.keys(value).length > 0, 'Empty update payload')
      .safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid category payload', parsed.error.flatten())
    }

    try {
      const updated = await prisma.category.update({
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
      return sendError(reply, 409, 'conflict', 'Category update failed', error)
    }
  })

  app.delete('/categories/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid category id')
    }

    try {
      await prisma.category.delete({
        where: { id: params.data.id }
      })

      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch (error) {
      return sendError(reply, 404, 'not_found', 'Category not found', error)
    }
  })
}
