import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  EmailConfigSchema,
  EmailProviderSchema,
  GotifyConfigSchema,
  NotificationWebhookSettingsSchema,
  PushPlusConfigSchema,
  ResendConfigSchema,
  ServerchanConfigSchema,
  TelegramConfigSchema
} from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import {
  sendTestEmailNotification,
  sendTestEmailNotificationWithConfig,
  sendTestGotifyNotification,
  sendTestGotifyNotificationWithConfig,
  sendTestPushplusNotification,
  sendTestPushplusNotificationWithConfig,
  sendTestServerchanNotification,
  sendTestServerchanNotificationWithConfig,
  sendTestTelegramNotification,
  sendTestTelegramNotificationWithConfig
} from '../services/channel-notification.service'
import { scanRenewalNotifications } from '../services/notification.service'
import {
  getPrimaryWebhookEndpoint,
  sendTestWebhookNotification,
  sendTestWebhookNotificationWithConfig,
  upsertPrimaryWebhookEndpoint
} from '../services/webhook.service'

const EmailNotificationTestSchema = z.object({
  emailProvider: EmailProviderSchema.default('smtp'),
  smtpConfig: EmailConfigSchema.partial().default({}),
  resendConfig: ResendConfigSchema.partial().default({})
})

const NotificationScanDebugSchema = z.object({
  now: z.string().datetime({ offset: true }).optional(),
  dryRun: z.boolean().default(true)
})

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

  app.post('/notifications/scan-debug', async (request, reply) => {
    const parsed = NotificationScanDebugSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid scan debug payload', parsed.error.flatten())
    }

    const result = await scanRenewalNotifications(parsed.data.now ? new Date(parsed.data.now) : new Date(), {
      dryRun: parsed.data.dryRun
    })
    return sendOk(reply, result)
  })

  app.post('/notifications/test/email', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = EmailNotificationTestSchema.safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid email config payload', parsed.error.flatten())
        }
        await sendTestEmailNotificationWithConfig({
          emailProvider: parsed.data.emailProvider,
          smtpConfig: {
            host: parsed.data.smtpConfig.host ?? '',
            port: parsed.data.smtpConfig.port ?? 587,
            secure: parsed.data.smtpConfig.secure ?? false,
            username: parsed.data.smtpConfig.username ?? '',
            password: parsed.data.smtpConfig.password ?? '',
            from: parsed.data.smtpConfig.from ?? '',
            to: parsed.data.smtpConfig.to ?? ''
          },
          resendConfig: {
            apiBaseUrl: parsed.data.resendConfig.apiBaseUrl ?? 'https://api.resend.com/emails',
            apiKey: parsed.data.resendConfig.apiKey ?? '',
            from: parsed.data.resendConfig.from ?? '',
            to: parsed.data.resendConfig.to ?? ''
          }
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

  app.post('/notifications/test/serverchan', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = ServerchanConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid Server 酱 config payload', parsed.error.flatten())
        }
        const result = await sendTestServerchanNotificationWithConfig({
          sendkey: parsed.data.sendkey ?? ''
        })
        return sendOk(reply, result)
      }

      const result = await sendTestServerchanNotification()
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'serverchan_test_failed', error instanceof Error ? error.message : 'Serverchan test failed')
    }
  })

  app.post('/notifications/test/gotify', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = GotifyConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid Gotify config payload', parsed.error.flatten())
        }
        const result = await sendTestGotifyNotificationWithConfig({
          url: parsed.data.url ?? '',
          token: parsed.data.token ?? '',
          ignoreSsl: parsed.data.ignoreSsl ?? false
        })
        return sendOk(reply, result)
      }

      const result = await sendTestGotifyNotification()
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'gotify_test_failed', error instanceof Error ? error.message : 'Gotify test failed')
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
