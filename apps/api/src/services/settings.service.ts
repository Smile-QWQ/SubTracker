import {
  AiConfigSchema,
  DEFAULT_AI_CONFIG,
  StorageCapabilitiesSchema,
  SettingsSchema,
  type SettingsInput
} from '@subtracker/shared'
import { prisma } from '../db'
import { config } from '../config'
import { getWorkerCache, getWorkerLogoBucket } from '../runtime'
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

export async function getAppSettings(): Promise<SettingsInput> {
  const baseCurrency = await getSetting('baseCurrency', config.baseCurrency)
  const defaultNotifyDays = await getSetting('defaultNotifyDays', config.defaultNotifyDays)
  const defaultAdvanceReminderRules = resolveDefaultAdvanceReminderRules(
    await getSetting<string | null>('defaultAdvanceReminderRules', null),
    defaultNotifyDays,
    await getSetting('notifyOnDueDay', true)
  )
  const rememberSessionDays = await getSetting('rememberSessionDays', 7)
  const notifyOnDueDay = deriveNotifyOnDueDayFromAdvanceRules(defaultAdvanceReminderRules)
  const mergeMultiSubscriptionNotifications = await getSetting('mergeMultiSubscriptionNotifications', true)
  const monthlyBudgetBase = await getSetting<number | null>('monthlyBudgetBase', null)
  const yearlyBudgetBase = await getSetting<number | null>('yearlyBudgetBase', null)
  const enableTagBudgets = await getSetting('enableTagBudgets', false)
  const defaultOverdueReminderRules = resolveDefaultOverdueReminderRules(
    await getSetting<string | null>('defaultOverdueReminderRules', null),
    await getSetting<Array<1 | 2 | 3>>('overdueReminderDays', [1, 2, 3])
  )
  const overdueReminderDays = deriveOverdueReminderDaysFromRules(defaultOverdueReminderRules)
  const tagBudgets = await getSetting<Record<string, number>>('tagBudgets', {})
  const emailNotificationsEnabled = await getSetting('emailNotificationsEnabled', false)
  const pushplusNotificationsEnabled = await getSetting('pushplusNotificationsEnabled', false)
  const telegramNotificationsEnabled = await getSetting('telegramNotificationsEnabled', false)
  const emailConfig = await getSetting<SettingsInput['emailConfig']>('emailConfig', {
    provider: 'mailchannels',
    apiBaseUrl: config.mailchannelsApiUrl,
    fromEmail: '',
    fromName: '',
    replyTo: '',
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
  const storageCapabilities = StorageCapabilitiesSchema.parse({
    runtime: 'worker-lite',
    kvEnabled: Boolean(getWorkerCache()),
    r2Enabled: Boolean(getWorkerLogoBucket()),
    logoStorageEnabled: Boolean(getWorkerLogoBucket()),
    wallosImportMode: 'json-only'
  })

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
    aiConfig,
    storageCapabilities
  })
}
