import { AiConfigSchema, DEFAULT_AI_CONFIG, SettingsSchema, type SettingsInput } from '@subtracker/shared'
import { prisma } from '../db'
import { config } from '../config'

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

export async function getAppSettings(): Promise<SettingsInput> {
  const baseCurrency = await getSetting('baseCurrency', config.baseCurrency)
  const defaultNotifyDays = await getSetting('defaultNotifyDays', config.defaultNotifyDays)
  const rememberSessionDays = await getSetting('rememberSessionDays', 7)
  const notifyOnDueDay = await getSetting('notifyOnDueDay', true)
  const mergeMultiSubscriptionNotifications = await getSetting('mergeMultiSubscriptionNotifications', true)
  const monthlyBudgetBase = await getSetting<number | null>('monthlyBudgetBase', null)
  const yearlyBudgetBase = await getSetting<number | null>('yearlyBudgetBase', null)
  const enableTagBudgets = await getSetting('enableTagBudgets', false)
  const overdueReminderDays = await getSetting<Array<1 | 2 | 3>>('overdueReminderDays', [1, 2, 3])
  const tagBudgets = await getSetting<Record<string, number>>('tagBudgets', {})
  const emailNotificationsEnabled = await getSetting('emailNotificationsEnabled', false)
  const pushplusNotificationsEnabled = await getSetting('pushplusNotificationsEnabled', false)
  const telegramNotificationsEnabled = await getSetting('telegramNotificationsEnabled', false)
  const emailConfig = await getSetting<SettingsInput['emailConfig']>('emailConfig', {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    to: ''
  })
  const pushplusConfig = await getSetting<SettingsInput['pushplusConfig']>('pushplusConfig', {
    token: '',
    topic: ''
  })
  const telegramConfig = await getSetting<SettingsInput['telegramConfig']>('telegramConfig', {
    botToken: '',
    chatId: ''
  })
  const aiConfig = AiConfigSchema.parse(await getSetting<unknown>('aiConfig', DEFAULT_AI_CONFIG))

  return SettingsSchema.parse({
    baseCurrency,
    defaultNotifyDays,
    rememberSessionDays,
    notifyOnDueDay,
    mergeMultiSubscriptionNotifications,
    monthlyBudgetBase,
    yearlyBudgetBase,
    enableTagBudgets,
    overdueReminderDays,
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
