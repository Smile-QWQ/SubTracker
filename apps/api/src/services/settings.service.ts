import {
  AppriseConfigSchema,
  AiConfigSchema,
  DEFAULT_RESEND_API_URL,
  DEFAULT_AI_CONFIG,
  DEFAULT_TIMEZONE,
  createEmptyNotificationTemplateConfig,
  SettingsSchema,
  type AppLocale,
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

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key }
  })
}

function readSettingsValue<T>(settingsMap: Map<string, unknown>, key: string, fallback: T): T {
  return settingsMap.has(key) ? (settingsMap.get(key) as T) : fallback
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

export async function getAppSettings(): Promise<SettingsInput> {
  const rows = await prisma.setting.findMany()
  const settingsMap = new Map<string, unknown>(rows.map((row: { key: string; valueJson: unknown }) => [row.key, row.valueJson]))

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
  const barkNotificationsEnabled = readSettingsValue(settingsMap, 'barkNotificationsEnabled', false)
  const notifyxNotificationsEnabled = readSettingsValue(settingsMap, 'notifyxNotificationsEnabled', false)
  const appriseNotificationsEnabled = readSettingsValue(settingsMap, 'appriseNotificationsEnabled', false)
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
  const serverchanConfig = readSettingsValue<SettingsInput['serverchanConfig']>(settingsMap, 'serverchanConfig', DEFAULT_SERVERCHAN_CONFIG)
  const gotifyConfig = readSettingsValue<SettingsInput['gotifyConfig']>(settingsMap, 'gotifyConfig', DEFAULT_GOTIFY_CONFIG)
  const barkConfig = readSettingsValue<SettingsInput['barkConfig']>(settingsMap, 'barkConfig', DEFAULT_BARK_CONFIG)
  const notifyxConfig = readSettingsValue<SettingsInput['notifyxConfig']>(settingsMap, 'notifyxConfig', DEFAULT_NOTIFYX_CONFIG)
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
  await deleteSetting('systemDefaultLocale')
  return legacySystemLocale
}

export async function getResolvedAppLocale(): Promise<AppLocale> {
  return (await getStoredAppLocale()) ?? config.defaultAppLocale
}

export async function setAppLocale(locale: AppLocale): Promise<AppLocale> {
  await setSetting('appLocale', locale)
  await deleteSetting('systemDefaultLocale')
  return locale
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
    legacySmtpConfig,
    resendConfig,
    pushplusConfig,
    telegramConfig,
    serverchanConfig,
    gotifyConfig,
    barkConfig,
    notifyxConfig,
    appriseConfig,
    notificationTemplateConfig
  ] =
    await Promise.all([
      getSetting('emailNotificationsEnabled', false),
      getSetting<SettingsInput['emailProvider']>('emailProvider', 'smtp'),
      getSetting('pushplusNotificationsEnabled', false),
      getSetting('telegramNotificationsEnabled', false),
      getSetting('serverchanNotificationsEnabled', false),
      getSetting('gotifyNotificationsEnabled', false),
      getSetting('barkNotificationsEnabled', false),
      getSetting('notifyxNotificationsEnabled', false),
      getSetting('appriseNotificationsEnabled', false),
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
    smtpConfig: legacySmtpConfig ? { ...DEFAULT_SMTP_CONFIG, ...legacySmtpConfig, ...smtpConfig } : smtpConfig,
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

export async function getNotificationScanSettings() {
  const [defaultAdvanceReminderRules, defaultOverdueReminderRules, mergeMultiSubscriptionNotifications, timezone, locale] = await Promise.all([
    getDefaultAdvanceReminderRulesSetting(),
    (async () => {
      const overdueReminderDays = await getSetting<Array<1 | 2 | 3>>('overdueReminderDays', [1, 2, 3])
      return resolveDefaultOverdueReminderRules(
        await getSetting<string | null>('defaultOverdueReminderRules', null),
        overdueReminderDays
      )
    })(),
    getSetting('mergeMultiSubscriptionNotifications', true),
    getSetting('timezone', normalizeAppTimezone(process.env.TZ ?? DEFAULT_TIMEZONE)),
    getResolvedAppLocale()
  ])

  return {
    defaultAdvanceReminderRules,
    defaultOverdueReminderRules,
    mergeMultiSubscriptionNotifications,
    timezone,
    locale
  }
}
