import { FastifyInstance } from 'fastify'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  SettingsSchema
} from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { bumpCacheVersions, getCacheVersion } from '../services/cache-version.service'
import { invalidateWorkerLiteCache } from '../services/worker-lite-cache.service'
import { withWorkerTieredCache } from '../services/worker-tiered-cache.service'
import { getAppSettings } from '../services/settings.service'
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

function validateSettingsPayload(settings: Awaited<ReturnType<typeof getAppSettings>>) {
  if (settings.emailNotificationsEnabled) {
    if (settings.emailProvider === 'smtp') {
      throw new Error('Cloudflare Worker 运行时暂不支持 SMTP，请改用 Resend')
    }

    const missingEmailFields =
      settings.emailProvider === 'resend'
        ? [
            ['Resend API URL', settings.resendConfig.apiBaseUrl],
            ['Resend API Key', settings.resendConfig.apiKey],
            ['发件人', settings.resendConfig.from],
            ['收件人', settings.resendConfig.to]
          ]
        : [
            ['SMTP Host', settings.smtpConfig.host],
            ['端口', settings.smtpConfig.port],
            ['用户名', settings.smtpConfig.username],
            ['密码', settings.smtpConfig.password],
            ['发件人', settings.smtpConfig.from],
            ['收件人', settings.smtpConfig.to]
          ]

    const missingEmailLabels = missingEmailFields
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingEmailLabels.length) {
      throw new Error(`启用邮箱通知时必须填写：${missingEmailLabels.join('、')}`)
    }
  }

  if (settings.pushplusNotificationsEnabled && !settings.pushplusConfig.token.trim()) {
    throw new Error('启用 PushPlus 时必须填写 Token')
  }

  const missingTelegramFields = [
    ['Bot Token', settings.telegramConfig.botToken],
    ['Chat ID', settings.telegramConfig.chatId]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.telegramNotificationsEnabled && missingTelegramFields.length) {
    throw new Error(`启用 Telegram 通知时必须填写：${missingTelegramFields.join('、')}`)
  }

  if (settings.serverchanNotificationsEnabled && !settings.serverchanConfig.sendkey.trim()) {
    throw new Error('启用 Server 酱时必须填写 SendKey')
  }

  if (settings.gotifyNotificationsEnabled) {
    const missingGotifyFields = [
      ['URL', settings.gotifyConfig.url],
      ['Token', settings.gotifyConfig.token]
    ]
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingGotifyFields.length) {
      throw new Error(`启用 Gotify 时必须填写：${missingGotifyFields.join('、')}`)
    }

    validateNotificationTargetUrl(settings.gotifyConfig.url.trim(), 'Gotify URL')
  }

  if (settings.barkNotificationsEnabled) {
    if (!settings.barkConfig.serverUrl.trim()) {
      throw new Error('启用 Bark 时必须填写 Server URL')
    }

    validateNotificationTargetUrl(settings.barkConfig.serverUrl.trim(), 'Bark Server URL')
  }

  if (settings.notifyxNotificationsEnabled && !settings.notifyxConfig.apiKey.trim()) {
    throw new Error('启用 NotifyX 时必须填写 API Key')
  }

  if (settings.appriseNotificationsEnabled) {
    const missingAppriseFields = [
      ['Apprise API Base URL', settings.appriseConfig.apiBaseUrl],
      ['Apprise Key', settings.appriseConfig.key]
    ]
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([label]) => label)

    if (missingAppriseFields.length) {
      throw new Error(`启用 Apprise 时必须填写：${missingAppriseFields.join('、')}`)
    }

    if (!settings.appriseConfig.targets.length) {
      throw new Error('启用 Apprise 时必须至少配置一个目标')
    }

    const invalidTarget = settings.appriseConfig.targets.find((target) => !target.id || !target.name.trim() || !target.url.trim())
    if (invalidTarget) {
      throw new Error('Apprise 目标必须包含 ID、名称和 URL')
    }

    if (!hasEnabledAppriseTargets(settings.appriseConfig)) {
      throw new Error('启用 Apprise 时必须至少启用一个目标')
    }

    validateNotificationTargetUrl(settings.appriseConfig.apiBaseUrl.trim(), 'Apprise API Base URL')
  }

  const missingAiFields = [
    ['Provider 名称', settings.aiConfig.providerName],
    ['Model', settings.aiConfig.model],
    ['API Base URL', settings.aiConfig.baseUrl],
    ['API Key', settings.aiConfig.apiKey]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if ((settings.aiConfig.enabled || settings.aiConfig.dashboardSummaryEnabled) && missingAiFields.length) {
    throw new Error(`启用 AI 能力时必须填写：${missingAiFields.join('、')}`)
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
      return sendError(reply, 422, 'validation_error', 'Invalid settings payload', parsed.error.flatten())
    }

    const currentSettings = await getAppSettings()
    let normalizedReminderSettings: ReturnType<typeof normalizeReminderSettingsPayload>

    try {
      normalizedReminderSettings = normalizeReminderSettingsPayload(parsed.data, currentSettings)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'Invalid reminder rules')
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

    try {
      validateSettingsPayload(nextSettings)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'Invalid settings payload')
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
