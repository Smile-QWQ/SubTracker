import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_ADVANCE_REMINDER_RULES, DEFAULT_AI_CONFIG, DEFAULT_MAILCHANNELS_API_URL, DEFAULT_OVERDUE_REMINDER_RULES } from '@subtracker/shared'
import { api } from '@/composables/api'
import type { Settings } from '@/types/api'

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings>({
    baseCurrency: 'CNY',
    defaultNotifyDays: 3,
    defaultAdvanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES,
    rememberSessionDays: 7,
    notifyOnDueDay: true,
    mergeMultiSubscriptionNotifications: true,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableTagBudgets: false,
    overdueReminderDays: [1, 2, 3],
    defaultOverdueReminderRules: DEFAULT_OVERDUE_REMINDER_RULES,
    tagBudgets: {},
    emailNotificationsEnabled: false,
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    emailConfig: {
      provider: 'mailchannels',
      apiBaseUrl: DEFAULT_MAILCHANNELS_API_URL,
      fromEmail: '',
      fromName: 'SubTracker Lite',
      replyTo: '',
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
    aiConfig: {
      ...DEFAULT_AI_CONFIG,
      capabilities: {
        ...DEFAULT_AI_CONFIG.capabilities
      }
    },
    storageCapabilities: {
      runtime: 'worker-lite',
      kvEnabled: false,
      r2Enabled: false,
      logoStorageEnabled: false,
      wallosImportMode: 'json-only'
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
