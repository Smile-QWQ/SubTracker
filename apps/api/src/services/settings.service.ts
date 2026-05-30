import {
  AppriseConfigSchema,
  AiConfigSchema,
  DEFAULT_AI_CONFIG,
  DEFAULT_RESEND_API_URL,
  DEFAULT_TIMEZONE,
  createEmptyNotificationTemplateConfig,
  SettingsSchema,
  type AppLocale,
  type NotificationWebhookSettingsInput,
  StorageCapabilitiesSchema,
  type SettingsInput
} from '@subtracker/shared'
import { config } from '../config'
import { getWorkerLogoBucket } from '../runtime'
import {
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  resolveDefaultAdvanceReminderRules,
  resolveDefaultOverdueReminderRules
} from './reminder-rules.service'
import { getCacheVersion } from './cache-version.service'
import { invalidateWorkerLiteCache, withWorkerLiteCache } from './worker-lite-cache.service'
import { getSettingLite, listSettingsLite, setSettingLite } from './worker-lite-repository.service'
import { buildIdleAppriseSyncState, hasEnabledAppriseTargets } from './apprise-config.service'

const DEFAULT_SMTP_CONFIG: SettingsInput['smtpConfig'] = {
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  from: '',
  to: ''
}

const DEFAULT_RESEND_CONFIG: SettingsInput['resendConfig'] = {
  apiBaseUrl: DEFAULT_RESEND_API_URL,
  apiKey: '',
  from: '',
  to: ''
}

const DEFAULT_SERVERCHAN_CONFIG: SettingsInput['serverchanConfig'] = {
  sendkey: ''
}

const DEFAULT_GOTIFY_CONFIG: SettingsInput['gotifyConfig'] = {
  url: '',
  token: '',
  ignoreSsl: false
}

const DEFAULT_BARK_CONFIG: SettingsInput['barkConfig'] = {
  serverUrl: '',
  deviceKey: '',
  isArchive: false
}

const DEFAULT_NOTIFYX_CONFIG: SettingsInput['notifyxConfig'] = {
  apiKey: '',
  team: ''
}

const DEFAULT_APPRISE_CONFIG: SettingsInput['appriseConfig'] = {
  apiBaseUrl: '',
  key: '',
  ignoreSsl: false,
  targets: [],
  ...buildIdleAppriseSyncState()
}

const DEFAULT_NOTIFICATION_TEMPLATE_CONFIG: SettingsInput['notificationTemplateConfig'] = createEmptyNotificationTemplateConfig()

export type NotificationChannelAvailability = {
  hasEnabledChannel: boolean
  primaryWebhookEnabled: boolean
  emailNotificationsEnabled: boolean
  pushplusNotificationsEnabled: boolean
  telegramNotificationsEnabled: boolean
  serverchanNotificationsEnabled: boolean
  gotifyNotificationsEnabled: boolean
  barkNotificationsEnabled: boolean
  notifyxNotificationsEnabled: boolean
  appriseNotificationsEnabled: boolean
}

function resolveSettingsCacheKey(prefix: string, version: number) {
  return `${prefix}:v${version}`
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const version = await getCacheVersion('settings')
  return withWorkerLiteCache('settings', resolveSettingsCacheKey(`setting:${key}`, version), () => getSettingLite(key, fallback), 30)
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await setSettingLite(key, value)
  await invalidateWorkerLiteCache(['settings'])
}

function readSettingsValue<T>(settingsMap: Map<string, unknown>, key: string, fallback: T): T {
  return settingsMap.has(key) ? (settingsMap.get(key) as T) : fallback
}

function buildStorageCapabilities() {
  return StorageCapabilitiesSchema.parse({
    runtime: 'worker-lite',
    r2Enabled: Boolean(getWorkerLogoBucket()),
    logoStorageEnabled: Boolean(getWorkerLogoBucket()),
    wallosImportMode: 'json-db-zip'
  })
}

function readLegacyResendConfig(settingsMap: Map<string, unknown>) {
  const legacy = readSettingsValue<Record<string, unknown> | null>(settingsMap, 'emailConfig', null)
  if (!legacy || Array.isArray(legacy)) return null

  return {
    apiBaseUrl: String(legacy.apiBaseUrl ?? config.resendApiUrl ?? DEFAULT_RESEND_API_URL).trim() || DEFAULT_RESEND_API_URL,
    apiKey: String(legacy.apiKey ?? '').trim(),
    from: String(legacy.from ?? '').trim(),
    to: String(legacy.to ?? '').trim()
  } satisfies SettingsInput['resendConfig']
}

function readPrimaryWebhookEnabled(settingsMap: Map<string, unknown>) {
  const raw = readSettingsValue<NotificationWebhookSettingsInput | Record<string, unknown> | null>(
    settingsMap,
    'notificationWebhook',
    null
  )

  if (!raw || Array.isArray(raw)) {
    return false
  }

  const enabled = Boolean(raw.enabled)
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  return enabled && Boolean(url)
}

function hasDirectForgotPasswordChannelEnabled(settings: {
  emailNotificationsEnabled: boolean
  pushplusNotificationsEnabled: boolean
  telegramNotificationsEnabled: boolean
  serverchanNotificationsEnabled: boolean
  gotifyNotificationsEnabled: boolean
  barkNotificationsEnabled: boolean
  notifyxNotificationsEnabled: boolean
  appriseDirectChannelEnabled: boolean
}) {
  return Boolean(
    settings.emailNotificationsEnabled ||
      settings.pushplusNotificationsEnabled ||
      settings.telegramNotificationsEnabled ||
      settings.serverchanNotificationsEnabled ||
      settings.gotifyNotificationsEnabled ||
      settings.barkNotificationsEnabled ||
      settings.notifyxNotificationsEnabled ||
      settings.appriseDirectChannelEnabled
  )
}

export async function getStoredAppLocale(): Promise<AppLocale | null> {
  const appLocale = await getSetting<AppLocale | null>('appLocale', null)
  if (appLocale) {
    return appLocale
  }

  const legacySystemLocale = await getSetting<AppLocale | null>('systemDefaultLocale', null)
  if (!legacySystemLocale) {
    return null
  }

  await setSetting('appLocale', legacySystemLocale)
  await setSetting('systemDefaultLocale', null)
  return legacySystemLocale
}

export async function getResolvedAppLocale(): Promise<AppLocale> {
  return (await getStoredAppLocale()) ?? config.defaultAppLocale
}

export async function setAppLocale(locale: AppLocale): Promise<AppLocale> {
  await setSetting('appLocale', locale)
  await setSetting('systemDefaultLocale', null)
  return locale
}

export async function getAppSettings(): Promise<SettingsInput> {
  const version = await getCacheVersion('settings')
  return withWorkerLiteCache(
    'settings',
    resolveSettingsCacheKey('app-settings', version),
    async () => {
      const settingsMap = await listSettingsLite()

      const baseCurrency = readSettingsValue(settingsMap, 'baseCurrency', config.baseCurrency)
      const timezone = readSettingsValue(settingsMap, 'timezone', DEFAULT_TIMEZONE)
      const defaultNotifyDays = readSettingsValue(settingsMap, 'defaultNotifyDays', config.defaultNotifyDays)
      const defaultAdvanceReminderRules = resolveDefaultAdvanceReminderRules(
        readSettingsValue<string | null>(settingsMap, 'defaultAdvanceReminderRules', null),
        defaultNotifyDays,
        readSettingsValue(settingsMap, 'notifyOnDueDay', true)
      )
      const rememberSessionDays = readSettingsValue(settingsMap, 'rememberSessionDays', 7)
      const notifyOnDueDay = deriveNotifyOnDueDayFromAdvanceRules(defaultAdvanceReminderRules)
      const mergeMultiSubscriptionNotifications = readSettingsValue(settingsMap, 'mergeMultiSubscriptionNotifications', true)
      const monthlyBudgetBase = readSettingsValue<number | null>(settingsMap, 'monthlyBudgetBase', null)
      const yearlyBudgetBase = readSettingsValue<number | null>(settingsMap, 'yearlyBudgetBase', null)
      const enableTagBudgets = readSettingsValue(settingsMap, 'enableTagBudgets', false)
      const defaultOverdueReminderRules = resolveDefaultOverdueReminderRules(
        readSettingsValue<string | null>(settingsMap, 'defaultOverdueReminderRules', null),
        readSettingsValue<Array<1 | 2 | 3>>(settingsMap, 'overdueReminderDays', [1, 2, 3])
      )
      const overdueReminderDays = deriveOverdueReminderDaysFromRules(defaultOverdueReminderRules)
      const tagBudgets = readSettingsValue<Record<string, number>>(settingsMap, 'tagBudgets', {})
      const emailNotificationsEnabled = readSettingsValue(settingsMap, 'emailNotificationsEnabled', false)
      const emailProvider = readSettingsValue<SettingsInput['emailProvider']>(settingsMap, 'emailProvider', 'resend')
      const pushplusNotificationsEnabled = readSettingsValue(settingsMap, 'pushplusNotificationsEnabled', false)
      const telegramNotificationsEnabled = readSettingsValue(settingsMap, 'telegramNotificationsEnabled', false)
      const serverchanNotificationsEnabled = readSettingsValue(settingsMap, 'serverchanNotificationsEnabled', false)
      const gotifyNotificationsEnabled = readSettingsValue(settingsMap, 'gotifyNotificationsEnabled', false)
      const barkNotificationsEnabled = readSettingsValue(settingsMap, 'barkNotificationsEnabled', false)
      const notifyxNotificationsEnabled = readSettingsValue(settingsMap, 'notifyxNotificationsEnabled', false)
      const appriseNotificationsEnabled = readSettingsValue(settingsMap, 'appriseNotificationsEnabled', false)
      const smtpConfig = readSettingsValue<SettingsInput['smtpConfig']>(settingsMap, 'smtpConfig', DEFAULT_SMTP_CONFIG)
      const resendConfig = readSettingsValue<SettingsInput['resendConfig']>(
        settingsMap,
        'resendConfig',
        readLegacyResendConfig(settingsMap) ?? DEFAULT_RESEND_CONFIG
      )
      const pushplusConfig = readSettingsValue<SettingsInput['pushplusConfig']>(settingsMap, 'pushplusConfig', {
        token: '',
        topic: ''
      })
      const telegramConfig = readSettingsValue<SettingsInput['telegramConfig']>(settingsMap, 'telegramConfig', {
        botToken: '',
        chatId: ''
      })
      const serverchanConfig = readSettingsValue<SettingsInput['serverchanConfig']>(
        settingsMap,
        'serverchanConfig',
        DEFAULT_SERVERCHAN_CONFIG
      )
      const gotifyConfig = readSettingsValue<SettingsInput['gotifyConfig']>(settingsMap, 'gotifyConfig', DEFAULT_GOTIFY_CONFIG)
      const barkConfig = readSettingsValue<SettingsInput['barkConfig']>(settingsMap, 'barkConfig', DEFAULT_BARK_CONFIG)
      const notifyxConfig = readSettingsValue<SettingsInput['notifyxConfig']>(settingsMap, 'notifyxConfig', DEFAULT_NOTIFYX_CONFIG)
      const appriseConfig = AppriseConfigSchema.parse(
        readSettingsValue<SettingsInput['appriseConfig']>(settingsMap, 'appriseConfig', DEFAULT_APPRISE_CONFIG)
      )
      const forgotPasswordEnabled =
        readSettingsValue(settingsMap, 'forgotPasswordEnabled', false) &&
        hasDirectForgotPasswordChannelEnabled({
          emailNotificationsEnabled,
          pushplusNotificationsEnabled,
          telegramNotificationsEnabled,
          serverchanNotificationsEnabled,
          gotifyNotificationsEnabled,
          barkNotificationsEnabled,
          notifyxNotificationsEnabled,
          appriseDirectChannelEnabled: appriseNotificationsEnabled && hasEnabledAppriseTargets(appriseConfig)
        })
      const notificationTemplateConfig = readSettingsValue<SettingsInput['notificationTemplateConfig']>(
        settingsMap,
        'notificationTemplateConfig',
        DEFAULT_NOTIFICATION_TEMPLATE_CONFIG
      )
      const aiConfig = AiConfigSchema.parse(readSettingsValue<unknown>(settingsMap, 'aiConfig', DEFAULT_AI_CONFIG))

      return SettingsSchema.parse({
        baseCurrency,
        timezone,
        defaultNotifyDays: deriveNotifyDaysBeforeFromAdvanceRules(defaultAdvanceReminderRules) || defaultNotifyDays,
        defaultAdvanceReminderRules,
        rememberSessionDays,
        forgotPasswordEnabled,
        notifyOnDueDay,
        mergeMultiSubscriptionNotifications,
        monthlyBudgetBase,
        yearlyBudgetBase,
        enableTagBudgets,
        overdueReminderDays,
        defaultOverdueReminderRules,
        tagBudgets,
        emailNotificationsEnabled,
        emailProvider,
        pushplusNotificationsEnabled,
        telegramNotificationsEnabled,
        serverchanNotificationsEnabled,
        gotifyNotificationsEnabled,
        barkNotificationsEnabled,
        notifyxNotificationsEnabled,
        appriseNotificationsEnabled,
        smtpConfig,
        resendConfig,
        pushplusConfig,
        telegramConfig,
        serverchanConfig,
        gotifyConfig,
        barkConfig,
        notifyxConfig,
        appriseConfig,
        notificationTemplateConfig,
        aiConfig,
        storageCapabilities: buildStorageCapabilities()
      })
    },
    30
  )
}

export async function getRememberSessionDays(): Promise<number> {
  return getSetting('rememberSessionDays', 7)
}

export async function getAppTimezone(): Promise<string> {
  return String(await getSetting('timezone', DEFAULT_TIMEZONE)) || DEFAULT_TIMEZONE
}

export async function getAiConfig() {
  return AiConfigSchema.parse(await getSetting<unknown>('aiConfig', DEFAULT_AI_CONFIG))
}

export async function getDefaultAdvanceReminderRulesSetting() {
  const defaultNotifyDays = await getSetting('defaultNotifyDays', config.defaultNotifyDays)
  const notifyOnDueDay = await getSetting('notifyOnDueDay', true)
  return resolveDefaultAdvanceReminderRules(
    await getSetting<string | null>('defaultAdvanceReminderRules', null),
    defaultNotifyDays,
    notifyOnDueDay
  )
}

export async function getNotificationChannelSettings() {
  const [
    emailNotificationsEnabled,
    emailProvider,
    pushplusNotificationsEnabled,
    telegramNotificationsEnabled,
    serverchanNotificationsEnabled,
    gotifyNotificationsEnabled,
    barkNotificationsEnabled,
    notifyxNotificationsEnabled,
    appriseNotificationsEnabled,
    smtpConfig,
    resendConfig,
    pushplusConfig,
    telegramConfig,
    serverchanConfig,
    gotifyConfig,
    barkConfig,
    notifyxConfig,
    appriseConfig,
    notificationTemplateConfig
  ] = await Promise.all([
    getSetting('emailNotificationsEnabled', false),
    getSetting<SettingsInput['emailProvider']>('emailProvider', 'resend'),
    getSetting('pushplusNotificationsEnabled', false),
    getSetting('telegramNotificationsEnabled', false),
    getSetting('serverchanNotificationsEnabled', false),
    getSetting('gotifyNotificationsEnabled', false),
    getSetting('barkNotificationsEnabled', false),
    getSetting('notifyxNotificationsEnabled', false),
    getSetting('appriseNotificationsEnabled', false),
    getSetting<SettingsInput['smtpConfig']>('smtpConfig', DEFAULT_SMTP_CONFIG),
    getSetting<SettingsInput['resendConfig']>('resendConfig', DEFAULT_RESEND_CONFIG),
    getSetting<SettingsInput['pushplusConfig']>('pushplusConfig', {
      token: '',
      topic: ''
    }),
    getSetting<SettingsInput['telegramConfig']>('telegramConfig', {
      botToken: '',
      chatId: ''
    }),
    getSetting<SettingsInput['serverchanConfig']>('serverchanConfig', DEFAULT_SERVERCHAN_CONFIG),
    getSetting<SettingsInput['gotifyConfig']>('gotifyConfig', DEFAULT_GOTIFY_CONFIG),
    getSetting<SettingsInput['barkConfig']>('barkConfig', DEFAULT_BARK_CONFIG),
    getSetting<SettingsInput['notifyxConfig']>('notifyxConfig', DEFAULT_NOTIFYX_CONFIG),
    getSetting<SettingsInput['appriseConfig']>('appriseConfig', DEFAULT_APPRISE_CONFIG),
    getSetting<SettingsInput['notificationTemplateConfig']>('notificationTemplateConfig', DEFAULT_NOTIFICATION_TEMPLATE_CONFIG)
  ])

  return {
    emailNotificationsEnabled,
    emailProvider,
    pushplusNotificationsEnabled,
    telegramNotificationsEnabled,
    serverchanNotificationsEnabled,
    gotifyNotificationsEnabled,
    barkNotificationsEnabled,
    notifyxNotificationsEnabled,
    appriseNotificationsEnabled,
    smtpConfig,
    resendConfig,
    pushplusConfig,
    telegramConfig,
    serverchanConfig,
    gotifyConfig,
    barkConfig,
    notifyxConfig,
    appriseConfig: AppriseConfigSchema.parse(appriseConfig),
    notificationTemplateConfig
  }
}

export async function getNotificationChannelAvailability(): Promise<NotificationChannelAvailability> {
  const version = await getCacheVersion('settings')
  return withWorkerLiteCache(
    'settings',
    resolveSettingsCacheKey('notification-channel-availability', version),
    async () => {
      const settingsMap = await listSettingsLite()
      const primaryWebhookEnabled = readPrimaryWebhookEnabled(settingsMap)
      const emailNotificationsEnabled = readSettingsValue(settingsMap, 'emailNotificationsEnabled', false)
      const pushplusNotificationsEnabled = readSettingsValue(settingsMap, 'pushplusNotificationsEnabled', false)
      const telegramNotificationsEnabled = readSettingsValue(settingsMap, 'telegramNotificationsEnabled', false)
      const serverchanNotificationsEnabled = readSettingsValue(settingsMap, 'serverchanNotificationsEnabled', false)
      const gotifyNotificationsEnabled = readSettingsValue(settingsMap, 'gotifyNotificationsEnabled', false)
      const barkNotificationsEnabled = readSettingsValue(settingsMap, 'barkNotificationsEnabled', false)
      const notifyxNotificationsEnabled = readSettingsValue(settingsMap, 'notifyxNotificationsEnabled', false)
      const appriseNotificationsEnabled = readSettingsValue(settingsMap, 'appriseNotificationsEnabled', false)
      const appriseConfig = AppriseConfigSchema.parse(
        readSettingsValue<SettingsInput['appriseConfig']>(settingsMap, 'appriseConfig', DEFAULT_APPRISE_CONFIG)
      )
      const appriseDirectChannelEnabled = appriseNotificationsEnabled && hasEnabledAppriseTargets(appriseConfig)

      return {
        hasEnabledChannel:
          primaryWebhookEnabled ||
          emailNotificationsEnabled ||
          pushplusNotificationsEnabled ||
          telegramNotificationsEnabled ||
          serverchanNotificationsEnabled ||
          gotifyNotificationsEnabled ||
          barkNotificationsEnabled ||
          notifyxNotificationsEnabled ||
          appriseDirectChannelEnabled,
        primaryWebhookEnabled,
        emailNotificationsEnabled,
        pushplusNotificationsEnabled,
        telegramNotificationsEnabled,
        serverchanNotificationsEnabled,
        gotifyNotificationsEnabled,
        barkNotificationsEnabled,
        notifyxNotificationsEnabled,
        appriseNotificationsEnabled
      }
    },
    30
  )
}

export async function getNotificationScanSettings() {
  const [defaultAdvanceReminderRules, defaultOverdueReminderRules, mergeMultiSubscriptionNotifications, timezone] = await Promise.all([
    getDefaultAdvanceReminderRulesSetting(),
    (async () => {
      const overdueReminderDays = await getSetting<Array<1 | 2 | 3>>('overdueReminderDays', [1, 2, 3])
      return resolveDefaultOverdueReminderRules(
        await getSetting<string | null>('defaultOverdueReminderRules', null),
        overdueReminderDays
      )
    })(),
    getSetting('mergeMultiSubscriptionNotifications', true),
    getSetting('timezone', DEFAULT_TIMEZONE)
  ])

  return {
    defaultAdvanceReminderRules,
    defaultOverdueReminderRules,
    mergeMultiSubscriptionNotifications,
    timezone
  }
}
