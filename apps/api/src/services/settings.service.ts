import {
  AiConfigSchema,
  DEFAULT_RESEND_API_URL,
  DEFAULT_AI_CONFIG,
  DEFAULT_TIMEZONE,
  SettingsSchema,
  type SettingsInput
} from '@subtracker/shared'
import { prisma } from '../db'
import { config } from '../config'
import {
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  resolveDefaultAdvanceReminderRules,
  resolveDefaultOverdueReminderRules
} from './reminder-rules.service'
import { normalizeAppTimezone } from '../utils/timezone'

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
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) return fallback
  return row.valueJson as T
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { valueJson: value as object },
    create: { key, valueJson: value as object }
  })
}

function readSettingsValue<T>(settingsMap: Map<string, unknown>, key: string, fallback: T): T {
  return settingsMap.has(key) ? (settingsMap.get(key) as T) : fallback
}

export async function getAppSettings(): Promise<SettingsInput> {
  const rows = await prisma.setting.findMany()
  const settingsMap = new Map(rows.map((row) => [row.key, row.valueJson]))

  const baseCurrency = readSettingsValue(settingsMap, 'baseCurrency', config.baseCurrency)
  const timezoneFallback = normalizeAppTimezone(process.env.TZ ?? DEFAULT_TIMEZONE)
  const timezone = readSettingsValue(settingsMap, 'timezone', timezoneFallback)
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
  const emailProvider = readSettingsValue<SettingsInput['emailProvider']>(settingsMap, 'emailProvider', 'smtp')
  const pushplusNotificationsEnabled = readSettingsValue(settingsMap, 'pushplusNotificationsEnabled', false)
  const telegramNotificationsEnabled = readSettingsValue(settingsMap, 'telegramNotificationsEnabled', false)
  const legacySmtpConfig = readSettingsValue<SettingsInput['smtpConfig'] | null>(settingsMap, 'emailConfig', null)
  const smtpConfig = readSettingsValue<SettingsInput['smtpConfig']>(settingsMap, 'smtpConfig', legacySmtpConfig ?? DEFAULT_SMTP_CONFIG)
  const resendConfig = readSettingsValue<SettingsInput['resendConfig']>(settingsMap, 'resendConfig', DEFAULT_RESEND_CONFIG)
  const pushplusConfig = readSettingsValue<SettingsInput['pushplusConfig']>(settingsMap, 'pushplusConfig', {
    token: '',
    topic: ''
  })
  const telegramConfig = readSettingsValue<SettingsInput['telegramConfig']>(settingsMap, 'telegramConfig', {
    botToken: '',
    chatId: ''
  })
  const serverchanNotificationsEnabled = readSettingsValue(settingsMap, 'serverchanNotificationsEnabled', false)
  const gotifyNotificationsEnabled = readSettingsValue(settingsMap, 'gotifyNotificationsEnabled', false)
  const serverchanConfig = readSettingsValue<SettingsInput['serverchanConfig']>(settingsMap, 'serverchanConfig', DEFAULT_SERVERCHAN_CONFIG)
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
    aiConfig
  })
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
    legacySmtpConfig,
    resendConfig,
    pushplusConfig,
    telegramConfig,
    serverchanConfig,
    gotifyConfig
  ] =
    await Promise.all([
      getSetting('emailNotificationsEnabled', false),
      getSetting<SettingsInput['emailProvider']>('emailProvider', 'smtp'),
      getSetting('pushplusNotificationsEnabled', false),
      getSetting('telegramNotificationsEnabled', false),
      getSetting('serverchanNotificationsEnabled', false),
      getSetting('gotifyNotificationsEnabled', false),
      getSetting<SettingsInput['smtpConfig']>('smtpConfig', DEFAULT_SMTP_CONFIG),
      getSetting<SettingsInput['smtpConfig'] | null>('emailConfig', null),
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
    smtpConfig: legacySmtpConfig ? { ...DEFAULT_SMTP_CONFIG, ...legacySmtpConfig, ...smtpConfig } : smtpConfig,
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
    getSetting('timezone', normalizeAppTimezone(process.env.TZ ?? DEFAULT_TIMEZONE))
  ])

  return {
    defaultAdvanceReminderRules,
    defaultOverdueReminderRules,
    mergeMultiSubscriptionNotifications,
    timezone
  }
}
