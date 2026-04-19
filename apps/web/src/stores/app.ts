import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_AI_CONFIG } from '@subtracker/shared'
import { api } from '@/composables/api'
import type { Settings } from '@/types/api'

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings>({
    baseCurrency: 'CNY',
    defaultNotifyDays: 3,
    rememberSessionDays: 7,
    notifyOnDueDay: true,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableTagBudgets: false,
    overdueReminderDays: [1, 2, 3],
    tagBudgets: {},
    emailNotificationsEnabled: false,
    pushplusNotificationsEnabled: false,
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
