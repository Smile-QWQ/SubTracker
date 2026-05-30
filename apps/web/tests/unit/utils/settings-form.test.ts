import { describe, expect, it } from 'vitest'
import { DEFAULT_RESEND_API_URL, createEmptyNotificationTemplateConfig } from '@subtracker/shared'
import { cloneSettingsForForm } from '@/utils/settings-form'
import type { Settings } from '@/types/api'

describe('cloneSettingsForForm', () => {
  it('deep clones nested settings objects used by SettingsPage forms', () => {
    const original: Settings = {
      baseCurrency: 'CNY',
      timezone: 'Asia/Shanghai',
      defaultNotifyDays: 3,
      defaultAdvanceReminderRules: '3&09:30;0&09:30;',
      rememberSessionDays: 7,
      forgotPasswordEnabled: false,
      notifyOnDueDay: true,
      mergeMultiSubscriptionNotifications: true,
      monthlyBudgetBase: 100,
      yearlyBudgetBase: 1000,
      enableTagBudgets: true,
      overdueReminderDays: [1, 2, 3],
      defaultOverdueReminderRules: '1&09:30;2&09:30;',
      tagBudgets: { video: 50 },
      emailNotificationsEnabled: true,
      emailProvider: 'smtp',
      pushplusNotificationsEnabled: true,
      telegramNotificationsEnabled: true,
      serverchanNotificationsEnabled: true,
      gotifyNotificationsEnabled: true,
      barkNotificationsEnabled: true,
      notifyxNotificationsEnabled: true,
      appriseNotificationsEnabled: true,
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'user',
        password: 'secret',
        from: 'from@example.com',
        to: 'to@example.com'
      },
      resendConfig: {
        apiBaseUrl: DEFAULT_RESEND_API_URL,
        apiKey: 're_key',
        from: 'resend@example.com',
        to: 'resend-to@example.com'
      },
      pushplusConfig: {
        token: 'token',
        topic: 'topic'
      },
      telegramConfig: {
        botToken: 'bot',
        chatId: 'chat'
      },
      serverchanConfig: {
        sendkey: 'sctp123t'
      },
      gotifyConfig: {
        url: 'https://gotify.example.com',
        token: 'gotify-token',
        ignoreSsl: true
      },
      barkConfig: {
        serverUrl: 'https://api.day.app',
        deviceKey: 'device-key',
        isArchive: true
      },
      notifyxConfig: {
        apiKey: 'notifyx-key',
        team: 'team-id'
      },
      appriseConfig: {
        apiBaseUrl: 'https://apprise.example.com',
        key: 'subtracker',
        ignoreSsl: true,
        targets: [
          {
            id: 'target-1',
            name: 'Primary',
            url: 'mailto://demo:test@example.com',
            enabled: true
          }
        ],
        lastSyncStatus: 'synced',
        lastSyncAt: '2026-05-28T09:00:00.000Z',
        lastSyncError: null
      },
      notificationTemplateConfig: {
        ...createEmptyNotificationTemplateConfig(),
        markdown: {
          ...createEmptyNotificationTemplateConfig().markdown,
          singleReminder: {
            titleTemplate: '## {{title}}',
            bodyTemplate: '- **名称**：{{subscription.name}}'
          }
        }
      },
      aiConfig: {
        enabled: true,
        dashboardSummaryEnabled: true,
        providerPreset: 'custom',
        providerName: 'OpenAI',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        model: 'gpt',
        timeoutMs: 30000,
        promptTemplate: 'prompt',
        dashboardSummaryPromptTemplate: 'summary prompt',
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      }
    }

    const cloned = cloneSettingsForForm(original)

    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.smtpConfig).not.toBe(original.smtpConfig)
    expect(cloned.resendConfig).not.toBe(original.resendConfig)
    expect(cloned.pushplusConfig).not.toBe(original.pushplusConfig)
    expect(cloned.telegramConfig).not.toBe(original.telegramConfig)
    expect(cloned.serverchanConfig).not.toBe(original.serverchanConfig)
    expect(cloned.gotifyConfig).not.toBe(original.gotifyConfig)
    expect(cloned.barkConfig).not.toBe(original.barkConfig)
    expect(cloned.notifyxConfig).not.toBe(original.notifyxConfig)
    expect(cloned.appriseConfig).not.toBe(original.appriseConfig)
    expect(cloned.appriseConfig.targets).not.toBe(original.appriseConfig.targets)
    expect(cloned.appriseConfig.targets[0]).not.toBe(original.appriseConfig.targets[0])
    expect(cloned.notificationTemplateConfig).not.toBe(original.notificationTemplateConfig)
    expect(cloned.notificationTemplateConfig.markdown).not.toBe(original.notificationTemplateConfig.markdown)
    expect(cloned.notificationTemplateConfig.markdown.singleReminder).not.toBe(original.notificationTemplateConfig.markdown.singleReminder)
    expect(cloned.aiConfig).not.toBe(original.aiConfig)
    expect(cloned.aiConfig.capabilities).not.toBe(original.aiConfig.capabilities)
    expect(cloned.tagBudgets).not.toBe(original.tagBudgets)
    expect(cloned.overdueReminderDays).not.toBe(original.overdueReminderDays)
  })
})
