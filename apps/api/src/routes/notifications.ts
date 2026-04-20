import { FastifyInstance } from 'fastify'
import {
  EmailConfigSchema,
  NotificationWebhookSettingsSchema,
  PushPlusConfigSchema,
  TelegramConfigSchema
} from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import {
  sendTestEmailNotification,
  sendTestEmailNotificationWithConfig,
  sendTestPushplusNotification,
  sendTestPushplusNotificationWithConfig,
  sendTestTelegramNotification,
  sendTestTelegramNotificationWithConfig
} from '../services/channel-notification.service'
import {
  getPrimaryWebhookEndpoint,
  sendTestWebhookNotification,
  sendTestWebhookNotificationWithConfig,
  upsertPrimaryWebhookEndpoint
} from '../services/webhook.service'

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications/webhook', async (_, reply) => {
    const current = await getPrimaryWebhookEndpoint()
    return sendOk(reply, current)
  })

  app.put('/notifications/webhook', async (request, reply) => {
    const parsed = NotificationWebhookSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid webhook settings payload', parsed.error.flatten())
    }

    if (parsed.data.enabled && !parsed.data.url) {
      return sendError(reply, 422, 'validation_error', '启用 Webhook 时必须填写 URL')
    }

    const saved = await upsertPrimaryWebhookEndpoint(parsed.data)
    return sendOk(reply, saved)
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
        const result = await sendTestPushplusNotificationWithConfig({
          token: parsed.data.token ?? '',
          topic: parsed.data.topic ?? ''
        })
        return sendOk(reply, result)
      }

      const result = await sendTestPushplusNotification()
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'pushplus_test_failed', error instanceof Error ? error.message : 'PushPlus test failed')
    }
  })

  app.post('/notifications/test/telegram', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = TelegramConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid Telegram config payload', parsed.error.flatten())
        }
        const result = await sendTestTelegramNotificationWithConfig({
          botToken: parsed.data.botToken ?? '',
          chatId: parsed.data.chatId ?? ''
        })
        return sendOk(reply, result)
      }

      const result = await sendTestTelegramNotification()
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'telegram_test_failed', error instanceof Error ? error.message : 'Telegram test failed')
    }
  })

  app.post('/notifications/test/webhook', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = NotificationWebhookSettingsSchema.safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid webhook settings payload', parsed.error.flatten())
        }
        const result = await sendTestWebhookNotificationWithConfig(parsed.data)
        return sendOk(reply, result)
      }

      const result = await sendTestWebhookNotification()
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'webhook_test_failed', error instanceof Error ? error.message : 'Webhook test failed')
    }
  })

}
