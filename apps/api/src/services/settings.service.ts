import {
  AiConfigSchema,
  DEFAULT_AI_CONFIG,
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
  const pushplusNotificationsEnabled = readSettingsValue(settingsMap, 'pushplusNotificationsEnabled', false)
  const telegramNotificationsEnabled = readSettingsValue(settingsMap, 'telegramNotificationsEnabled', false)
  const emailConfig = readSettingsValue<SettingsInput['emailConfig']>(settingsMap, 'emailConfig', {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    to: ''
  })
  const pushplusConfig = readSettingsValue<SettingsInput['pushplusConfig']>(settingsMap, 'pushplusConfig', {
    token: '',
    topic: ''
  })
  const telegramConfig = readSettingsValue<SettingsInput['telegramConfig']>(settingsMap, 'telegramConfig', {
    botToken: '',
    chatId: ''
  })
  const aiConfig = AiConfigSchema.parse(readSettingsValue<unknown>(settingsMap, 'aiConfig', DEFAULT_AI_CONFIG))

  return SettingsSchema.parse({
    baseCurrency,
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
    pushplusNotificationsEnabled,
    telegramNotificationsEnabled,
    emailConfig,
    pushplusConfig,
    telegramConfig,
    aiConfig
  })
}

export async function getRememberSessionDays(): Promise<number> {
  return getSetting('rememberSessionDays', 7)
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
  const [emailNotificationsEnabled, pushplusNotificationsEnabled, telegramNotificationsEnabled, emailConfig, pushplusConfig, telegramConfig] =
    await Promise.all([
      getSetting('emailNotificationsEnabled', false),
      getSetting('pushplusNotificationsEnabled', false),
      getSetting('telegramNotificationsEnabled', false),
      getSetting<SettingsInput['emailConfig']>('emailConfig', {
        host: '',
        port: 587,
        secure: false,
        username: '',
        password: '',
        from: '',
        to: ''
      }),
      getSetting<SettingsInput['pushplusConfig']>('pushplusConfig', {
        token: '',
        topic: ''
      }),
      getSetting<SettingsInput['telegramConfig']>('telegramConfig', {
        botToken: '',
        chatId: ''
      })
    ])

  return {
    emailNotificationsEnabled,
    pushplusNotificationsEnabled,
    telegramNotificationsEnabled,
    emailConfig,
    pushplusConfig,
    telegramConfig
  }
}

export async function getNotificationScanSettings() {
  const [defaultAdvanceReminderRules, defaultOverdueReminderRules, mergeMultiSubscriptionNotifications] = await Promise.all([
    getDefaultAdvanceReminderRulesSetting(),
    (async () => {
      const overdueReminderDays = await getSetting<Array<1 | 2 | 3>>('overdueReminderDays', [1, 2, 3])
      return resolveDefaultOverdueReminderRules(
        await getSetting<string | null>('defaultOverdueReminderRules', null),
        overdueReminderDays
      )
    })(),
    getSetting('mergeMultiSubscriptionNotifications', true)
  ])

  return {
    defaultAdvanceReminderRules,
    defaultOverdueReminderRules,
    mergeMultiSubscriptionNotifications
  }
}
