import type { Settings } from '@/types/api'

export interface SettingsPageForm {
  baseCurrency: Settings['baseCurrency']
  timezone: Settings['timezone']
  defaultNotifyDays: Settings['defaultNotifyDays']
  defaultAdvanceReminderRules: Settings['defaultAdvanceReminderRules']
  rememberSessionDays: Settings['rememberSessionDays']
  forgotPasswordEnabled: Settings['forgotPasswordEnabled']
  notifyOnDueDay: Settings['notifyOnDueDay']
  mergeMultiSubscriptionNotifications: Settings['mergeMultiSubscriptionNotifications']
  monthlyBudgetBase?: Settings['monthlyBudgetBase']
  yearlyBudgetBase?: Settings['yearlyBudgetBase']
  enableTagBudgets: Settings['enableTagBudgets']
  overdueReminderDays: Settings['overdueReminderDays']
  defaultOverdueReminderRules: Settings['defaultOverdueReminderRules']
  tagBudgets: Settings['tagBudgets']
  emailNotificationsEnabled: Settings['emailNotificationsEnabled']
  emailProvider: Settings['emailProvider']
  pushplusNotificationsEnabled: Settings['pushplusNotificationsEnabled']
  telegramNotificationsEnabled: Settings['telegramNotificationsEnabled']
  serverchanNotificationsEnabled: Settings['serverchanNotificationsEnabled']
  gotifyNotificationsEnabled: Settings['gotifyNotificationsEnabled']
  smtpConfig: Settings['smtpConfig']
  resendConfig: Settings['resendConfig']
  pushplusConfig: Settings['pushplusConfig']
  telegramConfig: Settings['telegramConfig']
  serverchanConfig: Settings['serverchanConfig']
  gotifyConfig: Settings['gotifyConfig']
  aiConfig: Settings['aiConfig']
}

export function cloneSettingsForForm(settings: Settings): SettingsPageForm {
  const { systemDefaultLocale: _ignoredSystemDefaultLocale, ...rest } = settings

  return {
    ...rest,
    overdueReminderDays: [...rest.overdueReminderDays],
    tagBudgets: { ...rest.tagBudgets },
    smtpConfig: { ...rest.smtpConfig },
    resendConfig: { ...rest.resendConfig },
    pushplusConfig: { ...rest.pushplusConfig },
    telegramConfig: { ...rest.telegramConfig },
    serverchanConfig: { ...rest.serverchanConfig },
    gotifyConfig: { ...rest.gotifyConfig },
    aiConfig: {
      ...rest.aiConfig,
      capabilities: {
        ...rest.aiConfig.capabilities
      }
    }
  }
}
