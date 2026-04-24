import {
  AiConfigSchema,
  DEFAULT_AI_CONFIG,
  DEFAULT_RESEND_API_URL,
  DEFAULT_TIMEZONE,
  StorageCapabilitiesSchema,
  SettingsSchema,
  type SettingsInput
} from '@subtracker/shared'
import { config } from '../config'
import { getWorkerCache, getWorkerLogoBucket } from '../runtime'
import {
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  resolveDefaultAdvanceReminderRules,
  resolveDefaultOverdueReminderRules
} from './reminder-rules.service'
import { invalidateWorkerLiteCache, withWorkerLiteCache } from './worker-lite-cache.service'
import { getSettingLite, listSettingsLite, setSettingLite } from './worker-lite-repository.service'

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

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return withWorkerLiteCache('settings', `setting:${key}`, () => getSettingLite(key, fallback), 30)
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
    kvEnabled: Boolean(getWorkerCache()),
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

export async function getAppSettings(): Promise<SettingsInput> {
  return withWorkerLiteCache(
    'settings',
    'app-settings',
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
      const aiConfig = AiConfigSchema.parse(readSettingsValue<unknown>(settingsMap, 'aiConfig', DEFAULT_AI_CONFIG))

      return SettingsSchema.parse({
        baseCurrency,
        timezone,
        defaultNotifyDays: deriveNotifyDaysBeforeFromAdvanceRules(defaultAdvanceReminderRules) || defaultNotifyDays,
        defaultAdvanceReminderRules,
        rememberSessionDays,
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
        smtpConfig,
        resendConfig,
        pushplusConfig,
        telegramConfig,
        serverchanConfig,
        gotifyConfig,
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
  return (await getAppSettings()).timezone
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
    smtpConfig,
    resendConfig,
    pushplusConfig,
    telegramConfig,
    serverchanConfig,
    gotifyConfig
  ] = await Promise.all([
    getSetting('emailNotificationsEnabled', false),
    getSetting<SettingsInput['emailProvider']>('emailProvider', 'resend'),
    getSetting('pushplusNotificationsEnabled', false),
    getSetting('telegramNotificationsEnabled', false),
    getSetting('serverchanNotificationsEnabled', false),
    getSetting('gotifyNotificationsEnabled', false),
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
    getSetting<SettingsInput['gotifyConfig']>('gotifyConfig', DEFAULT_GOTIFY_CONFIG)
  ])

  return {
    emailNotificationsEnabled,
    emailProvider,
    pushplusNotificationsEnabled,
    telegramNotificationsEnabled,
    serverchanNotificationsEnabled,
    gotifyNotificationsEnabled,
    smtpConfig,
    resendConfig,
    pushplusConfig,
    telegramConfig,
    serverchanConfig,
    gotifyConfig
  }
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
