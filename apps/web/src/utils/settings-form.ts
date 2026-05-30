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
  notificationTemplateConfig: Settings['notificationTemplateConfig']
  aiConfig: Settings['aiConfig']
  storageCapabilities: Settings['storageCapabilities']
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
    notificationTemplateConfig: {
      text: {
        singleReminder: { ...settings.notificationTemplateConfig.text.singleReminder },
        mergedReminder: { ...settings.notificationTemplateConfig.text.mergedReminder },
        testNotification: { ...settings.notificationTemplateConfig.text.testNotification },
        forgotPassword: { ...settings.notificationTemplateConfig.text.forgotPassword }
      },
      markdown: {
        singleReminder: { ...settings.notificationTemplateConfig.markdown.singleReminder },
        mergedReminder: { ...settings.notificationTemplateConfig.markdown.mergedReminder },
        testNotification: { ...settings.notificationTemplateConfig.markdown.testNotification },
        forgotPassword: { ...settings.notificationTemplateConfig.markdown.forgotPassword }
      },
      html: {
        singleReminder: { ...settings.notificationTemplateConfig.html.singleReminder },
        mergedReminder: { ...settings.notificationTemplateConfig.html.mergedReminder },
        testNotification: { ...settings.notificationTemplateConfig.html.testNotification },
        forgotPassword: { ...settings.notificationTemplateConfig.html.forgotPassword }
      }
    },
    aiConfig: {
      ...settings.aiConfig,
      capabilities: {
        ...settings.aiConfig.capabilities
      }
    },
    storageCapabilities: settings.storageCapabilities
      ? {
          ...settings.storageCapabilities
        }
      : settings.storageCapabilities
  }
}
