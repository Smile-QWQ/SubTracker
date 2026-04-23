import {
  AiConfigSchema,
  DEFAULT_AI_CONFIG,
  DEFAULT_RESEND_API_URL,
  StorageCapabilitiesSchema,
  SettingsSchema,
  type SettingsInput
} from '@subtracker/shared'
import { config } from '../config'
import { getWorkerCache, getWorkerLogoBucket } from '../runtime'
import { withWorkerLiteCache } from './worker-lite-cache.service'
import {
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  resolveDefaultAdvanceReminderRules,
  resolveDefaultOverdueReminderRules
} from './reminder-rules.service'
import { invalidateWorkerLiteCache } from './worker-lite-cache.service'
import { getSettingLite, listSettingsLite, setSettingLite } from './worker-lite-repository.service'

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

export async function getAppSettings(): Promise<SettingsInput> {
  return withWorkerLiteCache(
    'settings',
    'app-settings',
    async () => {
      const settingsMap = await listSettingsLite()

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
        provider: 'resend',
        apiBaseUrl: config.resendApiUrl,
        apiKey: '',
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
      const normalizedEmailConfig = {
        provider: 'resend' as const,
        apiBaseUrl:
          String((emailConfig as { apiBaseUrl?: unknown })?.apiBaseUrl || config.resendApiUrl || DEFAULT_RESEND_API_URL).trim() ||
          DEFAULT_RESEND_API_URL,
        apiKey: String((emailConfig as { apiKey?: unknown })?.apiKey || '').trim(),
        from: String((emailConfig as { from?: unknown })?.from || '').trim(),
        to: String((emailConfig as { to?: unknown })?.to || '').trim()
      }
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
        emailConfig: normalizedEmailConfig,
        pushplusConfig,
        telegramConfig,
        aiConfig,
        storageCapabilities
      })
    },
    30
  )
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
        provider: 'resend',
        apiBaseUrl: config.resendApiUrl,
        apiKey: '',
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
    emailConfig: {
      provider: 'resend' as const,
      apiBaseUrl:
        String((emailConfig as { apiBaseUrl?: unknown })?.apiBaseUrl || config.resendApiUrl || DEFAULT_RESEND_API_URL).trim() ||
        DEFAULT_RESEND_API_URL,
      apiKey: String((emailConfig as { apiKey?: unknown })?.apiKey || '').trim(),
      from: String((emailConfig as { from?: unknown })?.from || '').trim(),
      to: String((emailConfig as { to?: unknown })?.to || '').trim()
    },
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
