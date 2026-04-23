import type { Settings } from '@/types/api'

export function cloneSettingsForForm(settings: Settings): Settings {
  return {
    ...settings,
    overdueReminderDays: [...settings.overdueReminderDays],
    tagBudgets: { ...settings.tagBudgets },
    emailConfig: { ...settings.emailConfig },
    pushplusConfig: { ...settings.pushplusConfig },
    telegramConfig: { ...settings.telegramConfig },
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
