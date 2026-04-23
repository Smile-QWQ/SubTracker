import { describe, expect, it } from 'vitest'
import { cloneSettingsForForm } from '@/utils/settings-form'
import type { Settings } from '@/types/api'

describe('cloneSettingsForForm', () => {
  it('deep clones nested settings objects used by SettingsPage forms', () => {
    const original: Settings = {
      baseCurrency: 'CNY',
      defaultNotifyDays: 3,
      defaultAdvanceReminderRules: '3&09:30;0&09:30;',
      rememberSessionDays: 7,
      notifyOnDueDay: true,
      mergeMultiSubscriptionNotifications: true,
      monthlyBudgetBase: 100,
      yearlyBudgetBase: 1000,
      enableTagBudgets: true,
      overdueReminderDays: [1, 2, 3],
      defaultOverdueReminderRules: '1&09:30;2&09:30;',
      tagBudgets: { video: 50 },
      emailNotificationsEnabled: true,
      pushplusNotificationsEnabled: true,
      telegramNotificationsEnabled: true,
      emailConfig: {
        provider: 'resend',
        apiBaseUrl: 'https://api.resend.com/emails',
        apiKey: 'key',
        from: 'SubTracker Lite <noreply@example.com>',
        to: 'to@example.com'
      },
      pushplusConfig: {
        token: 'token',
        topic: 'topic'
      },
      telegramConfig: {
        botToken: 'bot',
        chatId: 'chat'
      },
      aiConfig: {
        enabled: true,
        providerPreset: 'custom',
        providerName: 'OpenAI',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        model: 'gpt',
        timeoutMs: 30000,
        promptTemplate: 'prompt',
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      },
      storageCapabilities: {
        runtime: 'worker-lite',
        kvEnabled: true,
        r2Enabled: true,
        logoStorageEnabled: true,
        wallosImportMode: 'json-only'
      }
    }

    const cloned = cloneSettingsForForm(original)

    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.emailConfig).not.toBe(original.emailConfig)
    expect(cloned.pushplusConfig).not.toBe(original.pushplusConfig)
    expect(cloned.telegramConfig).not.toBe(original.telegramConfig)
    expect(cloned.aiConfig).not.toBe(original.aiConfig)
    expect(cloned.aiConfig.capabilities).not.toBe(original.aiConfig.capabilities)
    expect(cloned.tagBudgets).not.toBe(original.tagBudgets)
    expect(cloned.overdueReminderDays).not.toBe(original.overdueReminderDays)
    expect(cloned.storageCapabilities).not.toBe(original.storageCapabilities)
  })
})
