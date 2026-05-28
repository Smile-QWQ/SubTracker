import { FastifyInstance } from 'fastify'
import {
  AppriseConfigSchema,
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  SettingsSchema,
  getMessage,
  type AppLocale
} from '@subtracker/shared'
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
import {
  buildFailedAppriseSyncState,
  buildIdleAppriseSyncState,
  buildSuccessfulAppriseSyncState,
  hasEnabledAppriseTargets,
  normalizeAppriseTargets,
  withAppriseSyncState
} from '../services/apprise-config.service'
import { syncAppriseConfig } from '../services/apprise-notification.service'
import { createSubtrackerBackupArchive } from '../services/subtracker-backup.service'

function hasDirectForgotPasswordChannelEnabled(settings: {
  emailNotificationsEnabled: boolean
  pushplusNotificationsEnabled: boolean
  telegramNotificationsEnabled: boolean
  serverchanNotificationsEnabled: boolean
  gotifyNotificationsEnabled: boolean
  barkNotificationsEnabled: boolean
  notifyxNotificationsEnabled: boolean
  appriseNotificationsEnabled: boolean
  appriseConfig: Awaited<ReturnType<typeof getAppSettings>>['appriseConfig']
}) {
  return Boolean(
    settings.emailNotificationsEnabled ||
      settings.pushplusNotificationsEnabled ||
      settings.telegramNotificationsEnabled ||
      settings.serverchanNotificationsEnabled ||
      settings.gotifyNotificationsEnabled ||
      settings.barkNotificationsEnabled ||
      settings.notifyxNotificationsEnabled ||
      (settings.appriseNotificationsEnabled && hasEnabledAppriseTargets(settings.appriseConfig))
  )
}

function normalizeAppriseConfigPayload(
  currentConfig: Awaited<ReturnType<typeof getAppSettings>>['appriseConfig'],
  incomingConfig?: Partial<Awaited<ReturnType<typeof getAppSettings>>['appriseConfig']>
) {
  if (!incomingConfig) {
    return currentConfig
  }

  const merged = AppriseConfigSchema.parse({
    ...currentConfig,
    ...incomingConfig,
    targets: incomingConfig.targets ? normalizeAppriseTargets(incomingConfig.targets) : currentConfig.targets
  })

  return {
    ...merged,
    lastSyncStatus: currentConfig.lastSyncStatus,
    lastSyncAt: currentConfig.lastSyncAt,
    lastSyncError: currentConfig.lastSyncError
  }
}

function isBarkCustomServerUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl.trim())
    return parsed.pathname.replace(/\/+$/, '') !== ''
  } catch {
    return false
  }
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
    serverUrl: getMessage(locale, 'common.labels.serverUrl'),
    deviceKey: getMessage(locale, 'common.labels.deviceKey'),
    key: getMessage(locale, 'common.labels.key'),
    team: getMessage(locale, 'common.labels.team'),
    providerName: getMessage(locale, 'settings.labels.providerName'),
    model: getMessage(locale, 'common.labels.model'),
    apiBaseUrl: getMessage(locale, 'settings.labels.apiBaseUrl'),
    apiKey: getMessage(locale, 'settings.labels.apiKey'),
    appriseApiBaseUrl: getMessage(locale, 'settings.labels.appriseApiBaseUrl'),
    appriseKey: getMessage(locale, 'settings.labels.appriseKey')
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
      locale,
      allowPrivateHost: true
    })
  }

  if (settings.barkNotificationsEnabled) {
    if (!String(settings.barkConfig.serverUrl ?? '').trim()) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.barkFieldsRequired', {
          fields: labels.serverUrl
        })
      )
    }

    const barkUrl = validateNotificationTargetUrl(settings.barkConfig.serverUrl.trim(), {
      label: getMessage(locale, 'settings.labels.barkServerUrl'),
      locale,
      allowPrivateHost: true
    })

    if (!isBarkCustomServerUrl(barkUrl.toString()) && !String(settings.barkConfig.deviceKey ?? '').trim()) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.barkFieldsRequired', {
          fields: labels.deviceKey
        })
      )
    }
  }

  if (settings.notifyxNotificationsEnabled) {
    const missingNotifyxFields = [[labels.apiKey, settings.notifyxConfig.apiKey]]
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingNotifyxFields.length) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.notifyxFieldsRequired', {
          fields: missingNotifyxFields.join(fieldSeparator)
        })
      )
    }
  }

  if (settings.appriseNotificationsEnabled) {
    const missingAppriseFields = [
      [labels.appriseApiBaseUrl, settings.appriseConfig.apiBaseUrl],
      [labels.appriseKey, settings.appriseConfig.key]
    ]
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingAppriseFields.length) {
      throw new Error(
        getMessage(locale, 'api.errors.settings.appriseFieldsRequired', {
          fields: missingAppriseFields.join(fieldSeparator)
        })
      )
    }

    if (!settings.appriseConfig.targets.length) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseTargetsRequired'))
    }

    if (!hasEnabledAppriseTargets(settings.appriseConfig)) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseEnabledTargetsRequired'))
    }

    if (settings.appriseConfig.targets.some((target) => !target.id || !target.name.trim() || !target.url.trim())) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseTargetFieldsRequired'))
    }

    const targetUrls = settings.appriseConfig.targets.map((target) => target.url.trim())
    if (new Set(targetUrls).size !== targetUrls.length) {
      throw new Error(getMessage(locale, 'api.errors.settings.appriseTargetUrlDuplicate'))
    }

    validateNotificationTargetUrl(settings.appriseConfig.apiBaseUrl.trim(), {
      label: getMessage(locale, 'settings.labels.appriseApiBaseUrl'),
      locale,
      allowPrivateHost: true
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
      appriseConfig: normalizeAppriseConfigPayload(currentSettings.appriseConfig, parsed.data.appriseConfig),
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
    const appriseRelatedKeys = new Set(['appriseConfig'])

    const filteredEntries = settingsToPersist.filter(([key]) => !reminderRelatedKeys.has(key) && !appriseRelatedKeys.has(key))
    filteredEntries.push(
      ['forgotPasswordEnabled', nextSettings.forgotPasswordEnabled],
      ['defaultAdvanceReminderRules', normalizedReminderSettings.defaultAdvanceReminderRules],
      ['defaultOverdueReminderRules', normalizedReminderSettings.defaultOverdueReminderRules],
      ['defaultNotifyDays', normalizedReminderSettings.defaultNotifyDays],
      ['notifyOnDueDay', normalizedReminderSettings.notifyOnDueDay],
      ['overdueReminderDays', normalizedReminderSettings.overdueReminderDays]
    )

    await Promise.all(filteredEntries.map(([key, value]) => setSetting(key, value)))

    const appriseTouched = parsed.data.appriseNotificationsEnabled !== undefined || parsed.data.appriseConfig !== undefined
    if (appriseTouched) {
      let persistedAppriseConfig = nextSettings.appriseConfig

      if (!nextSettings.appriseNotificationsEnabled) {
        persistedAppriseConfig = withAppriseSyncState(nextSettings.appriseConfig, buildIdleAppriseSyncState())
      } else {
        try {
          await syncAppriseConfig(nextSettings.appriseConfig, { locale })
          persistedAppriseConfig = withAppriseSyncState(nextSettings.appriseConfig, buildSuccessfulAppriseSyncState())
        } catch (error) {
          persistedAppriseConfig = withAppriseSyncState(nextSettings.appriseConfig, buildFailedAppriseSyncState(error))
        }
      }

      nextSettings.appriseConfig = persistedAppriseConfig
      await setSetting('appriseConfig', persistedAppriseConfig)
    }

    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })
}
