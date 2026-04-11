import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendCreated, sendError, sendOk } from '../http'
import { CreateWebhookEndpointSchema, UpdateWebhookEndpointSchema } from '@subtracker/shared'
import { listWebhookDeliveries } from '../services/webhook.service'

export async function webhookRoutes(app: FastifyInstance) {
  app.get('/webhooks', async (_, reply) => {
    const rows = await prisma.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } })
    return sendOk(reply, rows)
  })

  app.post('/webhooks', async (request, reply) => {
    const parsed = CreateWebhookEndpointSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid webhook payload', parsed.error.flatten())
    }

    const created = await prisma.webhookEndpoint.create({
      data: {
        name: parsed.data.name,
        url: parsed.data.url,
        secret: parsed.data.secret,
        enabled: parsed.data.enabled,
        eventsJson: parsed.data.events
      }
    })

    return sendCreated(reply, created)
  })

  app.patch('/webhooks/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid webhook id')
    }

    const parsed = UpdateWebhookEndpointSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid webhook payload', parsed.error.flatten())
    }

    const payload = parsed.data

    try {
      const updated = await prisma.webhookEndpoint.update({
        where: { id: params.data.id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.url !== undefined ? { url: payload.url } : {}),
          ...(payload.secret !== undefined ? { secret: payload.secret } : {}),
          ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
          ...(payload.events !== undefined ? { eventsJson: payload.events } : {})
        }
      })
      return sendOk(reply, updated)
    } catch {
      return sendError(reply, 404, 'not_found', 'Webhook not found')
    }
  })

  app.get('/webhook-deliveries', async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100)
    })

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid query', parsed.error.flatten())
    }

    const deliveries = await listWebhookDeliveries(parsed.data.limit)
    return sendOk(reply, deliveries)
  })
}
