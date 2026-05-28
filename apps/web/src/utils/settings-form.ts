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
  barkNotificationsEnabled: Settings['barkNotificationsEnabled']
  notifyxNotificationsEnabled: Settings['notifyxNotificationsEnabled']
  appriseNotificationsEnabled: Settings['appriseNotificationsEnabled']
  smtpConfig: Settings['smtpConfig']
  resendConfig: Settings['resendConfig']
  pushplusConfig: Settings['pushplusConfig']
  telegramConfig: Settings['telegramConfig']
  serverchanConfig: Settings['serverchanConfig']
  gotifyConfig: Settings['gotifyConfig']
  barkConfig: Settings['barkConfig']
  notifyxConfig: Settings['notifyxConfig']
  appriseConfig: Settings['appriseConfig']
  aiConfig: Settings['aiConfig']
}

export function cloneSettingsForForm(settings: Settings): SettingsPageForm {
  return {
    ...settings,
    overdueReminderDays: [...settings.overdueReminderDays],
    tagBudgets: { ...settings.tagBudgets },
    smtpConfig: { ...settings.smtpConfig },
    resendConfig: { ...settings.resendConfig },
    pushplusConfig: { ...settings.pushplusConfig },
    telegramConfig: { ...settings.telegramConfig },
    serverchanConfig: { ...settings.serverchanConfig },
    gotifyConfig: { ...settings.gotifyConfig },
    barkConfig: { ...settings.barkConfig },
    notifyxConfig: { ...settings.notifyxConfig },
    appriseConfig: {
      ...settings.appriseConfig,
      targets: settings.appriseConfig.targets.map((target) => ({
        ...target
      }))
    },
    aiConfig: {
      ...settings.aiConfig,
      capabilities: {
        ...settings.aiConfig.capabilities
      }
    }
  }
}
