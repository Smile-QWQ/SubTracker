import type { Settings } from '@/types/api'

export function cloneSettingsForForm(settings: Settings): Settings {
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
    aiConfig: {
      ...settings.aiConfig,
      dashboardSummaryEnabled: settings.aiConfig.dashboardSummaryEnabled,
      dashboardSummaryPromptTemplate: settings.aiConfig.dashboardSummaryPromptTemplate,
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
