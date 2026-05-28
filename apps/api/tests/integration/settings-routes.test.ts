import Fastify, { type FastifyInstance } from 'fastify'
import { DEFAULT_RESEND_API_URL } from '@subtracker/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

const prismaMock = vi.hoisted(() => ({}))
const syncAppriseConfigMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/db', () => ({
  prisma: prismaMock
}))

vi.mock('../../src/services/apprise-notification.service', () => ({
  syncAppriseConfig: syncAppriseConfigMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    defaultNotifyDays: 3,
    defaultAdvanceReminderRules: '3&09:30;0&09:30;',
    rememberSessionDays: 7,
    forgotPasswordEnabled: (store.get('forgotPasswordEnabled') as boolean) ?? false,
    notifyOnDueDay: true,
    mergeMultiSubscriptionNotifications: (store.get('mergeMultiSubscriptionNotifications') as boolean) ?? true,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    enableTagBudgets: false,
    overdueReminderDays: [1, 2, 3],
    defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
    tagBudgets: {},
    emailNotificationsEnabled: (store.get('emailNotificationsEnabled') as boolean) ?? false,
    emailProvider: (store.get('emailProvider') as 'smtp' | 'resend' | undefined) ?? 'smtp',
    pushplusNotificationsEnabled: (store.get('pushplusNotificationsEnabled') as boolean) ?? false,
    telegramNotificationsEnabled: (store.get('telegramNotificationsEnabled') as boolean) ?? false,
    serverchanNotificationsEnabled: (store.get('serverchanNotificationsEnabled') as boolean) ?? false,
    gotifyNotificationsEnabled: (store.get('gotifyNotificationsEnabled') as boolean) ?? false,
    barkNotificationsEnabled: (store.get('barkNotificationsEnabled') as boolean) ?? false,
    notifyxNotificationsEnabled: (store.get('notifyxNotificationsEnabled') as boolean) ?? false,
    appriseNotificationsEnabled: (store.get('appriseNotificationsEnabled') as boolean) ?? false,
    smtpConfig: {
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from: '',
      to: '',
      ...(store.get('smtpConfig') as Record<string, unknown> | undefined)
    },
    resendConfig: {
      apiBaseUrl: DEFAULT_RESEND_API_URL,
      apiKey: '',
      from: '',
      to: '',
      ...(store.get('resendConfig') as Record<string, unknown> | undefined)
    },
    pushplusConfig: {
      token: '',
      topic: '',
      ...(store.get('pushplusConfig') as Record<string, unknown> | undefined)
    },
    telegramConfig: {
      botToken: '',
      chatId: '',
      ...(store.get('telegramConfig') as Record<string, unknown> | undefined)
    },
    serverchanConfig: {
      sendkey: '',
      ...(store.get('serverchanConfig') as Record<string, unknown> | undefined)
    },
    gotifyConfig: {
      url: '',
      token: '',
      ignoreSsl: false,
      ...(store.get('gotifyConfig') as Record<string, unknown> | undefined)
    },
    barkConfig: {
      serverUrl: '',
      deviceKey: '',
      isArchive: false,
      ...(store.get('barkConfig') as Record<string, unknown> | undefined)
    },
    notifyxConfig: {
      apiKey: '',
      team: '',
      ...(store.get('notifyxConfig') as Record<string, unknown> | undefined)
    },
    appriseConfig: {
      apiBaseUrl: '',
      key: '',
      ignoreSsl: false,
      targets: [],
      lastSyncStatus: 'idle',
      lastSyncAt: null,
      lastSyncError: null,
      ...(store.get('appriseConfig') as Record<string, unknown> | undefined)
    },
    aiConfig: {
      enabled: false,
      dashboardSummaryEnabled: false,
      providerPreset: 'custom',
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      timeoutMs: 30000,
      promptTemplate: '',
      dashboardSummaryPromptTemplate: '',
      capabilities: {
        vision: false,
        structuredOutput: true
      },
      ...(store.get('aiConfig') as Record<string, unknown> | undefined)
    }
  })),
  setSetting: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  })
}))

import { settingsRoutes } from '../../src/routes/settings'

describe('settings routes validation', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    store.clear()
    syncAppriseConfigMock.mockReset()
    syncAppriseConfigMock.mockResolvedValue(undefined)
    app = Fastify()
    await settingsRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects incomplete AI config when enabling AI capability', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        aiConfig: {
          enabled: true,
          dashboardSummaryEnabled: true,
          providerPreset: 'custom',
          providerName: '',
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          model: '',
          timeoutMs: 30000,
          promptTemplate: '',
          dashboardSummaryPromptTemplate: '',
          capabilities: {
            vision: false,
            structuredOutput: true
          }
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('启用 AI 能力时必须填写')
  })

  it('returns english validation errors when locale header is en-US', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: {
        'X-SubTracker-Locale': 'en-US'
      },
      payload: {
        emailNotificationsEnabled: true,
        emailProvider: 'smtp',
        smtpConfig: {
          host: '',
          port: 587,
          secure: false,
          username: '',
          password: '',
          from: '',
          to: ''
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toBe('To enable email notifications, fill in: SMTP Host, Username, Password, From, To')
  })

  it('accepts dashboard summary switch without forcing AI recognition to be enabled', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        aiConfig: {
          enabled: false,
          dashboardSummaryEnabled: true,
          providerPreset: 'custom',
          providerName: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'token',
          model: 'deepseek-chat',
          timeoutMs: 30000,
          promptTemplate: '',
          dashboardSummaryPromptTemplate: '你是一个统计摘要助手。',
          capabilities: {
            vision: false,
            structuredOutput: true
          }
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.aiConfig.dashboardSummaryEnabled).toBe(true)
    expect(res.json().data.aiConfig.enabled).toBe(false)
    expect(res.json().data.aiConfig.dashboardSummaryPromptTemplate).toBe('你是一个统计摘要助手。')
  })

  it('rejects locale fields in PATCH /settings', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        appLocale: 'en-US'
      }
    })

    expect(res.statusCode).toBe(422)
  })

  it('rejects incomplete email config when enabling email notifications', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        emailNotificationsEnabled: true,
        emailProvider: 'smtp',
        smtpConfig: {
          host: '',
          port: 587,
          secure: false,
          username: '',
          password: '',
          from: '',
          to: ''
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('启用邮箱通知时必须填写')
  })

  it('rejects incomplete resend config when enabling email notifications with resend', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        emailNotificationsEnabled: true,
        emailProvider: 'resend',
        resendConfig: {
          apiBaseUrl: DEFAULT_RESEND_API_URL,
          apiKey: '',
          from: '',
          to: ''
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('启用邮箱通知时必须填写')
  })

  it('rejects incomplete serverchan config when enabling serverchan notifications', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        serverchanNotificationsEnabled: true,
        serverchanConfig: {
          sendkey: ''
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('启用 Server 酱时必须填写')
  })

  it('rejects invalid gotify url when enabling gotify notifications', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        gotifyNotificationsEnabled: true,
        gotifyConfig: {
          url: 'ftp://gotify.example.com',
          token: 'token',
          ignoreSsl: false
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('Gotify URL')
  })

  it('accepts a private gotify url for self-hosted deployments', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        gotifyNotificationsEnabled: true,
        gotifyConfig: {
          url: 'http://192.168.50.10:8080',
          token: 'token',
          ignoreSsl: false
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(store.get('gotifyConfig')).toMatchObject({
      url: 'http://192.168.50.10:8080',
      token: 'token',
      ignoreSsl: false
    })
  })

  it('rejects incomplete bark config when enabling bark notifications', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        barkNotificationsEnabled: true,
        barkConfig: {
          serverUrl: 'https://api.day.app',
          deviceKey: ''
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('启用 Bark 时必须填写')
  })

  it('accepts bark custom url mode without a separate device key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        barkNotificationsEnabled: true,
        barkConfig: {
          serverUrl: 'https://my-bark.example/custom-key',
          deviceKey: '',
          isArchive: false
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(store.get('barkConfig')).toMatchObject({
      serverUrl: 'https://my-bark.example/custom-key',
      deviceKey: '',
      isArchive: false
    })
  })

  it('accepts a private bark server url for self-hosted deployments', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        barkNotificationsEnabled: true,
        barkConfig: {
          serverUrl: 'http://192.168.50.11:8080',
          deviceKey: 'device-key',
          isArchive: false
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(store.get('barkConfig')).toMatchObject({
      serverUrl: 'http://192.168.50.11:8080',
      deviceKey: 'device-key',
      isArchive: false
    })
  })

  it('rejects incomplete notifyx config when enabling notifyx notifications in english locale', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: {
        'X-SubTracker-Locale': 'en-US'
      },
      payload: {
        notifyxNotificationsEnabled: true,
        notifyxConfig: {
          apiKey: ''
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toBe('To enable NotifyX, fill in: API Key')
  })

  it('accepts a private Apprise API base url and persists synced state when save succeeds', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        appriseNotificationsEnabled: true,
        appriseConfig: {
          apiBaseUrl: 'https://127.0.0.1:8000',
          key: 'subtracker-main',
          ignoreSsl: true,
          targets: [
            {
              id: 'target-1',
              name: 'Primary',
              url: 'mailto://demo:test@example.com',
              enabled: true
            }
          ]
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(syncAppriseConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: 'https://127.0.0.1:8000',
        key: 'subtracker-main',
        targets: [
          expect.objectContaining({
            id: 'target-1',
            name: 'Primary',
            url: 'mailto://demo:test@example.com',
            enabled: true
          })
        ]
      }),
      { locale: 'zh-CN' }
    )
    expect((store.get('appriseConfig') as Record<string, unknown>).lastSyncStatus).toBe('synced')
  })

  it('rejects enabling apprise without enabled targets in english locale', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: {
        'X-SubTracker-Locale': 'en-US'
      },
      payload: {
        appriseNotificationsEnabled: true,
        appriseConfig: {
          apiBaseUrl: 'https://apprise.example.com',
          key: 'subtracker-main',
          targets: [
            {
              id: 'target-1',
              name: 'Primary',
              url: 'mailto://demo:test@example.com',
              enabled: false
            }
          ]
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toBe('To enable Apprise, keep at least one notification address enabled')
  })

  it('persists failed apprise sync state without rejecting the overall save', async () => {
    syncAppriseConfigMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))

    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        appriseNotificationsEnabled: true,
        appriseConfig: {
          apiBaseUrl: 'https://apprise.example.com',
          key: 'subtracker-main',
          targets: [
            {
              id: 'target-1',
              name: 'Primary',
              url: 'mailto://demo:test@example.com',
              enabled: true
            }
          ]
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect((store.get('appriseConfig') as Record<string, unknown>).lastSyncStatus).toBe('failed')
    expect((store.get('appriseConfig') as Record<string, unknown>).lastSyncError).toBe('connect ECONNREFUSED')
  })

  it('rejects invalid reminder rules', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        defaultAdvanceReminderRules: '3&25:99;'
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('时间必须为 HH:mm')
  })

  it('persists forgot-password switch in settings payload', async () => {
    store.set('emailNotificationsEnabled', true)
    store.set('smtpConfig', {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      username: 'user',
      password: 'pass',
      from: 'from@example.com',
      to: 'to@example.com'
    })
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        forgotPasswordEnabled: true
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.forgotPasswordEnabled).toBe(true)
    expect(store.get('forgotPasswordEnabled')).toBe(true)
  })

  it('rejects enabling forgot-password when no direct notification channel is enabled', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        forgotPasswordEnabled: true
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('请先启用至少一个可直达的通知渠道')
  })

  it('treats apprise as a valid direct channel for forgot-password enablement', async () => {
    store.set('appriseNotificationsEnabled', true)
    store.set('appriseConfig', {
      apiBaseUrl: 'https://apprise.example.com',
      key: 'subtracker-main',
      ignoreSsl: false,
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
    })

    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        forgotPasswordEnabled: true
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.forgotPasswordEnabled).toBe(true)
  })

})
