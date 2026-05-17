import { FastifyInstance } from 'fastify'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  SettingsSchema,
  getMessage,
  type AppLocale
} from '@subtracker/shared'
import { prisma } from '../db'
import { sendError, sendOk } from '../http'
import { detectRequestLocale } from '../i18n'
import { getAppSettings, setSetting } from '../services/settings.service'
import { validateNotificationTargetUrl } from '../services/notification-url.service'
import {
  buildAdvanceReminderRulesFromLegacy,
  buildOverdueReminderRules,
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  normalizeReminderRules
} from '../services/reminder-rules.service'
import { createSubtrackerBackupArchive } from '../services/subtracker-backup.service'

function hasDirectForgotPasswordChannelEnabled(settings: {
  emailNotificationsEnabled: boolean
  pushplusNotificationsEnabled: boolean
  telegramNotificationsEnabled: boolean
  serverchanNotificationsEnabled: boolean
  gotifyNotificationsEnabled: boolean
}) {
  return Boolean(
    settings.emailNotificationsEnabled ||
      settings.pushplusNotificationsEnabled ||
      settings.telegramNotificationsEnabled ||
      settings.serverchanNotificationsEnabled ||
      settings.gotifyNotificationsEnabled
  )
}

function validateSettingsPayload(
  settings: Awaited<ReturnType<typeof getAppSettings>>,
  locale: AppLocale = 'zh-CN'
) {
  const fieldSeparator = getMessage(locale, 'common.separators.fieldList')
  const labels = {
    smtpHost: getMessage(locale, 'settings.labels.smtpHost'),
    port: getMessage(locale, 'common.labels.port'),
    username: getMessage(locale, 'common.labels.username'),
    password: getMessage(locale, 'common.labels.password'),
    from: getMessage(locale, 'common.labels.from'),
    to: getMessage(locale, 'common.labels.to'),
    resendApiUrl: getMessage(locale, 'settings.labels.resendApiUrl'),
    resendApiKey: getMessage(locale, 'settings.labels.resendApiKey'),
    botToken: getMessage(locale, 'settings.labels.botToken'),
    chatId: getMessage(locale, 'settings.labels.chatId'),
    sendKey: getMessage(locale, 'settings.labels.sendKey'),
    url: getMessage(locale, 'common.labels.url'),
    token: getMessage(locale, 'common.labels.token'),
    providerName: getMessage(locale, 'settings.labels.providerName'),
    model: getMessage(locale, 'common.labels.model'),
    apiBaseUrl: getMessage(locale, 'settings.labels.apiBaseUrl'),
    apiKey: getMessage(locale, 'settings.labels.apiKey')
  }

  if (settings.emailNotificationsEnabled) {
    const missingEmailFields =
      settings.emailProvider === 'resend'
        ? [
            [labels.resendApiUrl, settings.resendConfig.apiBaseUrl],
            [labels.resendApiKey, settings.resendConfig.apiKey],
            [labels.from, settings.resendConfig.from],
            [labels.to, settings.resendConfig.to]
          ]
        : [
            [labels.smtpHost, settings.smtpConfig.host],
            [labels.port, settings.smtpConfig.port],
            [labels.username, settings.smtpConfig.username],
            [labels.password, settings.smtpConfig.password],
            [labels.from, settings.smtpConfig.from],
            [labels.to, settings.smtpConfig.to]
          ]

    const missingEmailLabels = missingEmailFields
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingEmailLabels.length) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.emailFieldsRequired', {
          fields: missingEmailLabels.join(fieldSeparator)
        })
      )
    }
  }

  if (settings.pushplusNotificationsEnabled && !settings.pushplusConfig.token.trim()) {
    throw new Error(getMessage(locale, 'api.errors.settings.pushplusTokenRequired'))
  }

  const missingTelegramFields = [
    [labels.botToken, settings.telegramConfig.botToken],
    [labels.chatId, settings.telegramConfig.chatId]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.telegramNotificationsEnabled && missingTelegramFields.length) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.telegramFieldsRequired', {
          fields: missingTelegramFields.join(fieldSeparator)
        })
      )
  }

  if (settings.serverchanNotificationsEnabled && !settings.serverchanConfig.sendkey.trim()) {
    throw new Error(getMessage(locale, 'api.errors.settings.serverchanSendKeyRequired'))
  }

  if (settings.gotifyNotificationsEnabled) {
    const missingGotifyFields = [
      [labels.url, settings.gotifyConfig.url],
      [labels.token, settings.gotifyConfig.token]
    ]
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingGotifyFields.length) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.gotifyFieldsRequired', {
          fields: missingGotifyFields.join(fieldSeparator)
        })
      )
    }

    validateNotificationTargetUrl(settings.gotifyConfig.url.trim(), {
      label: getMessage(locale, 'settings.labels.gotifyTargetUrl'),
      locale
    })
  }

  const missingAiFields = [
    [labels.providerName, settings.aiConfig.providerName],
    [labels.model, settings.aiConfig.model],
    [labels.apiBaseUrl, settings.aiConfig.baseUrl],
    [labels.apiKey, settings.aiConfig.apiKey]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.aiConfig.enabled && missingAiFields.length) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.aiFieldsRequired', {
          fields: missingAiFields.join(fieldSeparator)
        })
      )
  }
}

function normalizeReminderSettingsPayload(
  payload: Partial<Awaited<ReturnType<typeof getAppSettings>>>,
  currentSettings: Awaited<ReturnType<typeof getAppSettings>>,
  locale: AppLocale = 'zh-CN'
) {
  const nextSettings = {
    defaultAdvanceReminderRules:
      payload.defaultAdvanceReminderRules !== undefined
        ? normalizeReminderRules(payload.defaultAdvanceReminderRules, 'advance', locale)
        : payload.defaultNotifyDays !== undefined || payload.notifyOnDueDay !== undefined
          ? buildAdvanceReminderRulesFromLegacy(
              payload.defaultNotifyDays ?? currentSettings.defaultNotifyDays,
              payload.notifyOnDueDay ?? currentSettings.notifyOnDueDay
            ) || DEFAULT_ADVANCE_REMINDER_RULES
          : currentSettings.defaultAdvanceReminderRules,
    defaultOverdueReminderRules:
      payload.defaultOverdueReminderRules !== undefined
        ? normalizeReminderRules(payload.defaultOverdueReminderRules, 'overdue', locale)
        : payload.overdueReminderDays !== undefined
          ? buildOverdueReminderRules(payload.overdueReminderDays) || DEFAULT_OVERDUE_REMINDER_RULES
          : currentSettings.defaultOverdueReminderRules
  }

  return {
    ...nextSettings,
    defaultNotifyDays: deriveNotifyDaysBeforeFromAdvanceRules(nextSettings.defaultAdvanceReminderRules),
    notifyOnDueDay: deriveNotifyOnDueDayFromAdvanceRules(nextSettings.defaultAdvanceReminderRules),
    overdueReminderDays: deriveOverdueReminderDaysFromRules(nextSettings.defaultOverdueReminderRules)
  }
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings/export/backup', async (_request, reply) => {
    const archive = await createSubtrackerBackupArchive()
    reply.header('Content-Type', archive.contentType)
    reply.header('Content-Disposition', `attachment; filename="${archive.filename}"`)
    return reply.send(archive.buffer)
  })

  app.get('/settings', async (_, reply) => {
    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })

  app.patch('/settings', async (request, reply) => {
    const locale = request.locale ?? detectRequestLocale(request)
    const rawBody = request.body as Record<string, unknown> | null | undefined
    if (rawBody && typeof rawBody === 'object' && ('systemDefaultLocale' in rawBody || 'appLocale' in rawBody)) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSettingsPayload', undefined, {
        locale
      })
    }

    const parsed = SettingsSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSettingsPayload', parsed.error.flatten(), {
        locale
      })
    }

    const currentSettings = await getAppSettings()
    let normalizedReminderSettings: ReturnType<typeof normalizeReminderSettingsPayload>

    try {
      normalizedReminderSettings = normalizeReminderSettingsPayload(parsed.data, currentSettings, locale)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'api.errors.validation.invalidReminderRules', undefined, {
        locale
      })
    }

    const nextSettings = {
      ...currentSettings,
      ...parsed.data,
      ...normalizedReminderSettings,
      emailProvider: parsed.data.emailProvider ?? currentSettings.emailProvider,
      smtpConfig: parsed.data.smtpConfig ? { ...currentSettings.smtpConfig, ...parsed.data.smtpConfig } : currentSettings.smtpConfig,
      resendConfig: parsed.data.resendConfig ? { ...currentSettings.resendConfig, ...parsed.data.resendConfig } : currentSettings.resendConfig,
      pushplusConfig: parsed.data.pushplusConfig ? { ...currentSettings.pushplusConfig, ...parsed.data.pushplusConfig } : currentSettings.pushplusConfig,
      telegramConfig: parsed.data.telegramConfig
        ? { ...currentSettings.telegramConfig, ...parsed.data.telegramConfig }
        : currentSettings.telegramConfig,
      serverchanNotificationsEnabled: parsed.data.serverchanNotificationsEnabled ?? currentSettings.serverchanNotificationsEnabled,
      gotifyNotificationsEnabled: parsed.data.gotifyNotificationsEnabled ?? currentSettings.gotifyNotificationsEnabled,
      serverchanConfig: parsed.data.serverchanConfig
        ? { ...currentSettings.serverchanConfig, ...parsed.data.serverchanConfig }
        : currentSettings.serverchanConfig,
      gotifyConfig: parsed.data.gotifyConfig ? { ...currentSettings.gotifyConfig, ...parsed.data.gotifyConfig } : currentSettings.gotifyConfig,
      aiConfig: parsed.data.aiConfig
        ? {
            ...currentSettings.aiConfig,
            ...parsed.data.aiConfig,
            capabilities: {
              ...currentSettings.aiConfig.capabilities,
              ...parsed.data.aiConfig.capabilities
            }
          }
        : currentSettings.aiConfig
    }

    try {
      validateSettingsPayload(nextSettings, locale)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'api.errors.validation.invalidSettingsPayload', undefined, {
        locale
      })
    }

    if (
      parsed.data.forgotPasswordEnabled === true &&
      !hasDirectForgotPasswordChannelEnabled(nextSettings)
    ) {
      return sendError(reply, 422, 'validation_error', 'api.errors.auth.forgotPasswordChannelRequired', undefined, {
        locale
      })
    }

    if (!hasDirectForgotPasswordChannelEnabled(nextSettings)) {
      nextSettings.forgotPasswordEnabled = false
    }

    const settingsToPersist: Array<[string, unknown]> = Object.entries(parsed.data).filter(([, value]) => value !== undefined)
    const reminderRelatedKeys = new Set([
      'defaultNotifyDays',
      'notifyOnDueDay',
      'overdueReminderDays',
      'defaultAdvanceReminderRules',
      'defaultOverdueReminderRules'
    ])

    const filteredEntries = settingsToPersist.filter(([key]) => !reminderRelatedKeys.has(key))
    filteredEntries.push(
      ['forgotPasswordEnabled', nextSettings.forgotPasswordEnabled],
      ['defaultAdvanceReminderRules', normalizedReminderSettings.defaultAdvanceReminderRules],
      ['defaultOverdueReminderRules', normalizedReminderSettings.defaultOverdueReminderRules],
      ['defaultNotifyDays', normalizedReminderSettings.defaultNotifyDays],
      ['notifyOnDueDay', normalizedReminderSettings.notifyOnDueDay],
      ['overdueReminderDays', normalizedReminderSettings.overdueReminderDays]
    )

    await Promise.all(filteredEntries.map(([key, value]) => setSetting(key, value)))

    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })
}
