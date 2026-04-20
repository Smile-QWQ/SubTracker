import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_ADVANCE_REMINDER_RULES, DEFAULT_AI_CONFIG, DEFAULT_OVERDUE_REMINDER_RULES } from '@subtracker/shared'
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
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from: '',
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
