import { FastifyInstance } from 'fastify'
import {
  type AppLocale,
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  getMessage,
  isWorkerLiteBlockedSmtpPort,
  SettingsSchema
} from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { bumpCacheVersions, getCacheVersion } from '../services/cache-version.service'
import { invalidateWorkerLiteCache } from '../services/worker-lite-cache.service'
import { withWorkerTieredCache } from '../services/worker-tiered-cache.service'
import { getAppSettings, getResolvedAppLocale } from '../services/settings.service'
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
import { setSettingLite } from '../services/worker-lite-repository.service'
import { hasEnabledAppriseTargets } from '../services/apprise-config.service'

const SETTINGS_CACHE_TTL_SECONDS = 5 * 60

function validateSettingsPayload(settings: Awaited<ReturnType<typeof getAppSettings>>, locale: AppLocale) {
  const joinFieldLabels = (labels: string[]) => labels.join(getMessage(locale, 'common.separators.fieldList'))

  if (settings.emailNotificationsEnabled) {
    const missingEmailFields: Array<[string, unknown]> =
      settings.emailProvider === 'resend'
        ? [
            [getMessage(locale, 'settings.labels.resendApiUrl'), settings.resendConfig.apiBaseUrl],
            [getMessage(locale, 'settings.labels.resendApiKey'), settings.resendConfig.apiKey],
            [getMessage(locale, 'common.labels.from'), settings.resendConfig.from],
            [getMessage(locale, 'common.labels.to'), settings.resendConfig.to]
          ]
        : [
            [getMessage(locale, 'common.labels.host'), settings.smtpConfig.host],
            [getMessage(locale, 'common.labels.port'), settings.smtpConfig.port],
            [getMessage(locale, 'common.labels.username'), settings.smtpConfig.username],
            [getMessage(locale, 'common.labels.password'), settings.smtpConfig.password],
            [getMessage(locale, 'common.labels.from'), settings.smtpConfig.from],
            [getMessage(locale, 'common.labels.to'), settings.smtpConfig.to]
          ]

    const missingEmailLabels = missingEmailFields
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingEmailLabels.length) {
      throw new Error(getMessage(locale, 'api.errors.settings.emailFieldsRequired', { fields: joinFieldLabels(missingEmailLabels) }))
    }
  }

  if (settings.pushplusNotificationsEnabled && !settings.pushplusConfig.token.trim()) {
    throw new Error(getMessage(locale, 'api.errors.settings.pushplusTokenRequired'))
  }

  const missingTelegramFields = ([
    [getMessage(locale, 'common.labels.botToken'), settings.telegramConfig.botToken],
    [getMessage(locale, 'common.labels.chatId'), settings.telegramConfig.chatId]
  ] as Array<[string, unknown]>)
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.telegramNotificationsEnabled && missingTelegramFields.length) {
    throw new Error(getMessage(locale, 'api.errors.settings.telegramFieldsRequired', { fields: joinFieldLabels(missingTelegramFields) }))
  }

  if (settings.serverchanNotificationsEnabled && !settings.serverchanConfig.sendkey.trim()) {
    throw new Error(getMessage(locale, 'api.errors.settings.serverchanSendKeyRequired'))
  }

  if (settings.gotifyNotificationsEnabled) {
    const missingGotifyFields = ([
      [getMessage(locale, 'common.labels.url'), settings.gotifyConfig.url],
      [getMessage(locale, 'common.labels.token'), settings.gotifyConfig.token]
    ] as Array<[string, unknown]>)
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingGotifyFields.length) {
      throw new Error(getMessage(locale, 'api.errors.settings.gotifyFieldsRequired', { fields: joinFieldLabels(missingGotifyFields) }))
    }

    validateNotificationTargetUrl(settings.gotifyConfig.url.trim(), getMessage(locale, 'settings.labels.gotifyTargetUrl'))
  }

  if (settings.barkNotificationsEnabled) {
    if (!settings.barkConfig.serverUrl.trim()) {
      throw new Error(getMessage(locale, 'api.errors.settings.barkFieldsRequired', { fields: getMessage(locale, 'common.labels.serverUrl') }))
    }

    validateNotificationTargetUrl(settings.barkConfig.serverUrl.trim(), getMessage(locale, 'settings.labels.barkServerUrl'))
  }

  if (settings.notifyxNotificationsEnabled && !settings.notifyxConfig.apiKey.trim()) {
    throw new Error(getMessage(locale, 'api.errors.settings.notifyxFieldsRequired', { fields: getMessage(locale, 'common.labels.apiKey') }))
  }

  if (settings.appriseNotificationsEnabled) {
    const missingAppriseFields = ([
      [getMessage(locale, 'settings.labels.appriseApiBaseUrl'), settings.appriseConfig.apiBaseUrl],
      [getMessage(locale, 'settings.labels.appriseKey'), settings.appriseConfig.key]
    ] as Array<[string, unknown]>)
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingAppriseFields.length) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseFieldsRequired', { fields: joinFieldLabels(missingAppriseFields) }))
    }

    if (!settings.appriseConfig.targets.length) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseTargetsRequired'))
    }

    const invalidTarget = settings.appriseConfig.targets.find((target) => !target.id || !target.name.trim() || !target.url.trim())
    if (invalidTarget) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseTargetFieldsRequired'))
    }

    if (!hasEnabledAppriseTargets(settings.appriseConfig)) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseEnabledTargetsRequired'))
    }

    validateNotificationTargetUrl(settings.appriseConfig.apiBaseUrl.trim(), getMessage(locale, 'settings.labels.appriseApiBaseUrl'))
  }

  const missingAiFields = ([
    [getMessage(locale, 'settings.labels.providerName'), settings.aiConfig.providerName],
    [getMessage(locale, 'common.labels.model'), settings.aiConfig.model],
    [getMessage(locale, 'common.labels.apiBaseUrl'), settings.aiConfig.baseUrl],
    [getMessage(locale, 'common.labels.apiKey'), settings.aiConfig.apiKey]
  ] as Array<[string, unknown]>)
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if ((settings.aiConfig.enabled || settings.aiConfig.dashboardSummaryEnabled) && missingAiFields.length) {
    throw new Error(getMessage(locale, 'api.errors.settings.aiFieldsRequired', { fields: joinFieldLabels(missingAiFields) }))
  }
}

function normalizeReminderSettingsPayload(
  payload: Partial<Awaited<ReturnType<typeof getAppSettings>>>,
  currentSettings: Awaited<ReturnType<typeof getAppSettings>>
) {
  const nextSettings = {
    defaultAdvanceReminderRules:
      payload.defaultAdvanceReminderRules !== undefined
        ? normalizeReminderRules(payload.defaultAdvanceReminderRules, 'advance')
        : payload.defaultNotifyDays !== undefined || payload.notifyOnDueDay !== undefined
          ? buildAdvanceReminderRulesFromLegacy(
              payload.defaultNotifyDays ?? currentSettings.defaultNotifyDays,
              payload.notifyOnDueDay ?? currentSettings.notifyOnDueDay
            ) || DEFAULT_ADVANCE_REMINDER_RULES
          : currentSettings.defaultAdvanceReminderRules,
    defaultOverdueReminderRules:
      payload.defaultOverdueReminderRules !== undefined
        ? normalizeReminderRules(payload.defaultOverdueReminderRules, 'overdue')
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
    const version = await getCacheVersion('settings')
    const settings = await withWorkerTieredCache(
      'settings',
      `response:v${version}`,
      () => getAppSettings(),
      SETTINGS_CACHE_TTL_SECONDS
    )
    return sendOk(reply, settings)
  })

  app.patch('/settings', async (request, reply) => {
    const parsed = SettingsSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSettingsPayload', parsed.error.flatten())
    }

    const currentSettings = await getAppSettings()
    let normalizedReminderSettings: ReturnType<typeof normalizeReminderSettingsPayload>

    try {
      normalizedReminderSettings = normalizeReminderSettingsPayload(parsed.data, currentSettings)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'api.errors.validation.invalidReminderRules')
    }

    const nextSettings = {
      ...currentSettings,
      ...parsed.data,
      ...normalizedReminderSettings,
      enableTagBudgets: parsed.data.enableTagBudgets ?? currentSettings.enableTagBudgets,
      tagBudgets: parsed.data.tagBudgets ? { ...currentSettings.tagBudgets, ...parsed.data.tagBudgets } : currentSettings.tagBudgets,
      emailProvider: parsed.data.emailProvider ?? currentSettings.emailProvider,
      smtpConfig: parsed.data.smtpConfig ? { ...currentSettings.smtpConfig, ...parsed.data.smtpConfig } : currentSettings.smtpConfig,
      resendConfig: parsed.data.resendConfig ? { ...currentSettings.resendConfig, ...parsed.data.resendConfig } : currentSettings.resendConfig,
      pushplusConfig: parsed.data.pushplusConfig ? { ...currentSettings.pushplusConfig, ...parsed.data.pushplusConfig } : currentSettings.pushplusConfig,
      forgotPasswordEnabled: parsed.data.forgotPasswordEnabled ?? currentSettings.forgotPasswordEnabled,
      telegramConfig: parsed.data.telegramConfig
        ? { ...currentSettings.telegramConfig, ...parsed.data.telegramConfig }
        : currentSettings.telegramConfig,
      serverchanNotificationsEnabled: parsed.data.serverchanNotificationsEnabled ?? currentSettings.serverchanNotificationsEnabled,
      gotifyNotificationsEnabled: parsed.data.gotifyNotificationsEnabled ?? currentSettings.gotifyNotificationsEnabled,
      barkNotificationsEnabled: parsed.data.barkNotificationsEnabled ?? currentSettings.barkNotificationsEnabled,
      notifyxNotificationsEnabled: parsed.data.notifyxNotificationsEnabled ?? currentSettings.notifyxNotificationsEnabled,
      appriseNotificationsEnabled: parsed.data.appriseNotificationsEnabled ?? currentSettings.appriseNotificationsEnabled,
      serverchanConfig: parsed.data.serverchanConfig
        ? { ...currentSettings.serverchanConfig, ...parsed.data.serverchanConfig }
        : currentSettings.serverchanConfig,
      gotifyConfig: parsed.data.gotifyConfig ? { ...currentSettings.gotifyConfig, ...parsed.data.gotifyConfig } : currentSettings.gotifyConfig,
      barkConfig: parsed.data.barkConfig ? { ...currentSettings.barkConfig, ...parsed.data.barkConfig } : currentSettings.barkConfig,
      notifyxConfig: parsed.data.notifyxConfig
        ? { ...currentSettings.notifyxConfig, ...parsed.data.notifyxConfig }
        : currentSettings.notifyxConfig,
      appriseConfig: parsed.data.appriseConfig
        ? {
            ...currentSettings.appriseConfig,
            ...parsed.data.appriseConfig,
            targets: parsed.data.appriseConfig.targets
              ? parsed.data.appriseConfig.targets.map((target) => ({ ...target }))
              : currentSettings.appriseConfig.targets
          }
        : currentSettings.appriseConfig,
      notificationTemplateConfig: parsed.data.notificationTemplateConfig
        ? parsed.data.notificationTemplateConfig
        : currentSettings.notificationTemplateConfig,
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

    const locale = await getResolvedAppLocale()

    const emailSettingsTouched =
      parsed.data.emailProvider !== undefined ||
      parsed.data.emailNotificationsEnabled !== undefined ||
      parsed.data.smtpConfig !== undefined ||
      parsed.data.resendConfig !== undefined

    if (emailSettingsTouched && nextSettings.emailProvider === 'smtp' && isWorkerLiteBlockedSmtpPort(nextSettings.smtpConfig.port)) {
      return sendError(reply, 422, 'validation_error', getMessage(locale, 'api.errors.settings.smtpPort25Blocked'))
    }

    try {
      validateSettingsPayload(nextSettings, locale)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'api.errors.validation.invalidSettingsPayload')
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
      ['defaultAdvanceReminderRules', normalizedReminderSettings.defaultAdvanceReminderRules],
      ['defaultOverdueReminderRules', normalizedReminderSettings.defaultOverdueReminderRules],
      ['defaultNotifyDays', normalizedReminderSettings.defaultNotifyDays],
      ['notifyOnDueDay', normalizedReminderSettings.notifyOnDueDay],
      ['overdueReminderDays', normalizedReminderSettings.overdueReminderDays]
    )

    await Promise.all(filteredEntries.map(([key, value]) => setSettingLite(key, value)))
    await Promise.all([
      invalidateWorkerLiteCache(['settings', 'statistics', 'calendar', 'exchange-rates']),
      bumpCacheVersions(['settings', 'statistics', 'calendar', 'exchangeRates'])
    ])

    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })
}
