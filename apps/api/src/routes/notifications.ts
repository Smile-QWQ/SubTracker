import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendError, sendOk } from '../http'
import { EmailConfigSchema, PushPlusConfigSchema } from '@subtracker/shared'
import {
  sendTestEmailNotification,
  sendTestEmailNotificationWithConfig,
  sendTestPushplusNotification,
  sendTestPushplusNotificationWithConfig
} from '../services/channel-notification.service'
import {
  getPrimaryWebhookEndpoint,
  sendTestWebhookNotification,
  sendTestWebhookNotificationWithConfig,
  upsertPrimaryWebhookEndpoint
} from '../services/webhook.service'

const WebhookSettingsSchema = z.object({
  url: z.string().trim().max(500).default(''),
  secret: z.string().trim().max(200).default(''),
  enabled: z.boolean().default(false)
})

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications/webhook', async (_, reply) => {
    const current = await getPrimaryWebhookEndpoint()
    return sendOk(reply, {
      id: current?.id ?? '',
      enabled: current?.enabled ?? false,
      url: current?.url ?? '',
      secret: current?.secret ?? ''
    })
  })

  app.put('/notifications/webhook', async (request, reply) => {
    const parsed = WebhookSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid webhook settings payload', parsed.error.flatten())
    }

    if (parsed.data.enabled && (!parsed.data.url || !parsed.data.secret)) {
      return sendError(reply, 422, 'validation_error', '启用 Webhook 时必须填写 URL 和 Secret')
    }

    const saved = await upsertPrimaryWebhookEndpoint(parsed.data)
    return sendOk(reply, {
      id: saved.id,
      enabled: saved.enabled,
      url: saved.url,
      secret: saved.secret
    })
  })

  app.post('/notifications/test/email', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = EmailConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid email config payload', parsed.error.flatten())
        }
        await sendTestEmailNotificationWithConfig({
          host: parsed.data.host ?? '',
          port: parsed.data.port ?? 587,
          secure: parsed.data.secure ?? false,
          username: parsed.data.username ?? '',
          password: parsed.data.password ?? '',
          from: parsed.data.from ?? '',
          to: parsed.data.to ?? ''
        })
      } else {
        await sendTestEmailNotification()
      }
      return sendOk(reply, { success: true })
    } catch (error) {
      return sendError(reply, 400, 'email_test_failed', error instanceof Error ? error.message : 'Email test failed')
    }
  })

  app.post('/notifications/test/pushplus', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = PushPlusConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid PushPlus config payload', parsed.error.flatten())
        }
        await sendTestPushplusNotificationWithConfig({
          token: parsed.data.token ?? '',
          topic: parsed.data.topic ?? ''
        })
      } else {
        await sendTestPushplusNotification()
      }
      return sendOk(reply, { success: true })
    } catch (error) {
      return sendError(reply, 400, 'pushplus_test_failed', error instanceof Error ? error.message : 'PushPlus test failed')
    }
  })

  app.post('/notifications/test/webhook', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = WebhookSettingsSchema.safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid webhook settings payload', parsed.error.flatten())
        }
        await sendTestWebhookNotificationWithConfig(parsed.data)
      } else {
        await sendTestWebhookNotification()
      }
      return sendOk(reply, { success: true })
    } catch (error) {
      return sendError(reply, 400, 'webhook_test_failed', error instanceof Error ? error.message : 'Webhook test failed')
    }
  })
}
