import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_AI_CONFIG,
  DEFAULT_OVERDUE_REMINDER_RULES,
  DEFAULT_RESEND_API_URL,
  createEmptyNotificationTemplateConfig
} from '@subtracker/shared'
import { api } from '@/composables/api'
import type { Settings } from '@/types/api'

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings>({
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    defaultNotifyDays: 3,
    defaultAdvanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES,
    rememberSessionDays: 7,
    forgotPasswordEnabled: false,
    notifyOnDueDay: true,
    mergeMultiSubscriptionNotifications: true,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableTagBudgets: false,
    overdueReminderDays: [1, 2, 3],
    defaultOverdueReminderRules: DEFAULT_OVERDUE_REMINDER_RULES,
    tagBudgets: {},
    emailNotificationsEnabled: false,
    emailProvider: 'resend',
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false,
    barkNotificationsEnabled: false,
    notifyxNotificationsEnabled: false,
    appriseNotificationsEnabled: false,
    smtpConfig: {
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from: '',
      to: ''
    },
    resendConfig: {
      apiBaseUrl: DEFAULT_RESEND_API_URL,
      apiKey: '',
      from: 'SubTracker Lite <noreply@example.com>',
      to: ''
    },
    pushplusConfig: {
      token: '',
      topic: ''
    },
    telegramConfig: {
      botToken: '',
      chatId: ''
    },
    serverchanConfig: {
      sendkey: ''
    },
    gotifyConfig: {
      url: '',
      token: '',
      ignoreSsl: false
    },
    barkConfig: {
      serverUrl: '',
      deviceKey: '',
      isArchive: false
    },
    notifyxConfig: {
      apiKey: '',
      team: ''
    },
    appriseConfig: {
      apiBaseUrl: '',
      key: '',
      ignoreSsl: false,
      targets: [],
      lastSyncStatus: 'idle',
      lastSyncAt: null,
      lastSyncError: null
    },
    notificationTemplateConfig: createEmptyNotificationTemplateConfig(),
    storageCapabilities: {
      runtime: 'worker-lite',
      r2Enabled: false,
      logoStorageEnabled: false,
      wallosImportMode: 'json-db-zip'
    },
    aiConfig: {
      ...DEFAULT_AI_CONFIG,
      capabilities: {
        ...DEFAULT_AI_CONFIG.capabilities
      }
    }
  })

  async function refreshSettings() {
    settings.value = await api.getSettings()
  }

  return {
    settings,
    refreshSettings
  }
})
