import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppriseConfigSchema,
  BarkConfigSchema,
  EmailConfigSchema,
  EmailProviderSchema,
  GotifyConfigSchema,
  NotificationWebhookSettingsSchema,
  NotifyxConfigSchema,
  PushPlusConfigSchema,
  ResendConfigSchema,
  ServerchanConfigSchema,
  TelegramConfigSchema
} from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { detectRequestLocale } from '../i18n'
import {
  sendTestBarkNotification,
  sendTestBarkNotificationWithConfig,
  sendTestEmailNotification,
  sendTestEmailNotificationWithConfig,
  sendTestGotifyNotification,
  sendTestGotifyNotificationWithConfig,
  sendTestNotifyxNotification,
  sendTestNotifyxNotificationWithConfig,
  sendTestAppriseNotification,
  sendTestAppriseNotificationWithConfig,
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

const AppriseNotificationTestSchema = AppriseConfigSchema.partial().extend({
  targetId: z.string().min(1).max(100).optional()
})

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications/webhook', async (_, reply) => {
    const current = await getPrimaryWebhookEndpoint()
    return sendOk(reply, current)
  })

  app.put('/notifications/webhook', async (request, reply) => {
    const parsed = NotificationWebhookSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidWebhookSettingsPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    if (parsed.data.enabled && !parsed.data.url) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidWebhookUrlRequired', undefined, {
        locale: request.locale
      })
    }

    const saved = await upsertPrimaryWebhookEndpoint(parsed.data)
    return sendOk(reply, saved)
  })

  app.post('/notifications/scan-debug', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    const parsed = NotificationScanDebugSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidScanDebugPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    const result = await scanRenewalNotifications(parsed.data.now ? new Date(parsed.data.now) : new Date(), {
      dryRun: parsed.data.dryRun,
      includeDebugCandidates: true,
      locale
    })
    return sendOk(reply, result)
  })

  app.post('/notifications/test/email', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = EmailNotificationTestSchema.safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidEmailConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
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
        }, { locale })
      } else {
        await sendTestEmailNotification({ locale })
      }
      return sendOk(reply, { success: true })
    } catch (error) {
      return sendError(reply, 400, 'email_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.emailTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/pushplus', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = PushPlusConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidPushplusConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestPushplusNotificationWithConfig({
          token: parsed.data.token ?? '',
          topic: parsed.data.topic ?? ''
        }, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestPushplusNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'pushplus_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.pushplusTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/telegram', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = TelegramConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidTelegramConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestTelegramNotificationWithConfig({
          botToken: parsed.data.botToken ?? '',
          chatId: parsed.data.chatId ?? ''
        }, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestTelegramNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'telegram_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.telegramTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/serverchan', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = ServerchanConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidServerchanConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestServerchanNotificationWithConfig({
          sendkey: parsed.data.sendkey ?? ''
        }, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestServerchanNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'serverchan_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.serverchanTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/gotify', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = GotifyConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidGotifyConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestGotifyNotificationWithConfig({
          url: parsed.data.url ?? '',
          token: parsed.data.token ?? '',
          ignoreSsl: parsed.data.ignoreSsl ?? false
        }, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestGotifyNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'gotify_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.gotifyTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/bark', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = BarkConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidBarkConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestBarkNotificationWithConfig({
          serverUrl: parsed.data.serverUrl ?? '',
          deviceKey: parsed.data.deviceKey ?? '',
          isArchive: parsed.data.isArchive ?? false
        }, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestBarkNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'bark_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.barkTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/notifyx', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = NotifyxConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidNotifyxConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestNotifyxNotificationWithConfig({
          apiKey: parsed.data.apiKey ?? '',
          team: parsed.data.team ?? ''
        }, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestNotifyxNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'notifyx_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.notifyxTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/apprise', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = AppriseNotificationTestSchema.safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidAppriseConfigPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }

        const hasInlineConfig =
          parsed.data.apiBaseUrl !== undefined ||
          parsed.data.key !== undefined ||
          parsed.data.ignoreSsl !== undefined ||
          parsed.data.targets !== undefined

        if (!hasInlineConfig) {
          const result = await sendTestAppriseNotification({
            locale,
            targetId: parsed.data.targetId
          })
          return sendOk(reply, result)
        }

        const result = await sendTestAppriseNotificationWithConfig({
          apiBaseUrl: parsed.data.apiBaseUrl ?? '',
          key: parsed.data.key ?? '',
          ignoreSsl: parsed.data.ignoreSsl ?? false,
          targets: parsed.data.targets ?? [],
          lastSyncStatus: parsed.data.lastSyncStatus ?? 'idle',
          lastSyncAt: parsed.data.lastSyncAt ?? null,
          lastSyncError: parsed.data.lastSyncError ?? null
        }, {
          locale,
          targetId: parsed.data.targetId
        })
        return sendOk(reply, result)
      }

      const result = await sendTestAppriseNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'apprise_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.appriseTestFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/notifications/test/webhook', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    try {
      if (request.body) {
        const parsed = NotificationWebhookSettingsSchema.safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidWebhookSettingsPayload', parsed.error.flatten(), {
            locale: request.locale
          })
        }
        const result = await sendTestWebhookNotificationWithConfig(parsed.data, { locale })
        return sendOk(reply, result)
      }

      const result = await sendTestWebhookNotification({ locale })
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 400, 'webhook_test_failed', error instanceof Error ? error.message : 'api.errors.notifications.webhookTestFailed', undefined, {
        locale: request.locale
      })
    }
  })
}
