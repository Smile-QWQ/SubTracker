import type { FastifyError, FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendError, sendOk } from '../http'
import {
  deletePendingSubscriptionImage,
  importSubscriptionImage,
  listSubscriptionImages,
  readSubscriptionImage,
  SUBSCRIPTION_IMAGE_MAX_BYTES,
  SubscriptionImageError,
  uploadSubscriptionImage
} from '../services/subscription-images.service'

const uploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  dataBase64: z.string().min(1),
  svgConfirmed: z.boolean().optional()
})
const idSchema = z.object({ id: z.string().cuid() })

export async function subscriptionImageRoutes(app: FastifyInstance) {
  // Encapsulation keeps attachment parser/size errors as 4xx without changing legacy routes.
  await app.register(async (router) => {
    router.setErrorHandler<FastifyError>((error, request, reply) => {
      if (error instanceof SubscriptionImageError) {
        return sendError(reply, error.statusCode, 'subscription_image_error', error.message, undefined, { locale: request.locale })
      }
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        return sendError(reply, error.statusCode, 'validation_error',
          `api.errors.subscriptionImages.${error.statusCode === 413 ? 'tooLarge' : 'invalidImage'}`, undefined,
          { locale: request.locale })
      }
      throw error
    })

    router.post('/subscription-images/upload', {
      bodyLimit: Math.ceil(SUBSCRIPTION_IMAGE_MAX_BYTES / 3) * 4 + 4096
    }, async (request, reply) => {
      const parsed = uploadSchema.safeParse(request.body)
      if (!parsed.success) throw new SubscriptionImageError('invalidImage')
      return sendOk(reply, await uploadSubscriptionImage(parsed.data))
    })

    router.post('/subscription-images/import', async (request, reply) => {
      const parsed = z.object({ url: z.string().url().max(4096) }).safeParse(request.body)
      if (!parsed.success) throw new SubscriptionImageError('importFailed', 422)
      return sendOk(reply, await importSubscriptionImage(parsed.data.url))
    })

    router.get('/subscriptions/:id/images', async (request, reply) => {
      // Restored subscriptions may use legacy IDs rather than Prisma-generated CUIDs.
      const parsed = z.object({ id: z.string().min(1).max(128) }).safeParse(request.params)
      if (!parsed.success) throw new SubscriptionImageError('notFound', 404)
      return sendOk(reply, await listSubscriptionImages(parsed.data.id))
    })

    router.get('/subscription-images/:id/content', async (request, reply) => {
      const parsed = idSchema.safeParse(request.params)
      if (!parsed.success) throw new SubscriptionImageError('notFound', 404)
      const { buffer, contentType } = await readSubscriptionImage(parsed.data.id)
      return reply.header('Content-Type', contentType)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
        .send(buffer)
    })

    router.delete('/subscription-images/:id', async (request, reply) => {
      const parsed = idSchema.safeParse(request.params)
      if (!parsed.success) throw new SubscriptionImageError('notFound', 404)
      await deletePendingSubscriptionImage(parsed.data.id)
      return sendOk(reply, { id: parsed.data.id, deleted: true })
    })
  })
}
