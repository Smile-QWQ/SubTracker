import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/composables/api'
import type { Settings } from '@/types/api'

export const useAppStore = defineStore('app', () => {
  const settings = ref<Settings>({
    baseCurrency: 'CNY',
    defaultNotifyDays: 3,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableCategoryBudgets: false,
    categoryBudgets: {},
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
      enabled: false,
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      timeoutMs: 30000,
      promptTemplate: ''
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
