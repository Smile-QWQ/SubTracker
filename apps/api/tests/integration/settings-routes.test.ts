import Fastify, { type FastifyInstance } from 'fastify'
import { DEFAULT_RESEND_API_URL, DEFAULT_SMTP_PORT } from '@subtracker/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

const prismaMock = vi.hoisted(() => ({}))
const createSubtrackerBackupArchiveMock = vi.hoisted(() => vi.fn())

function resolveStoredEmailProvider() {
  const storedProvider = store.get('emailProvider') as 'smtp' | 'resend' | undefined
  if (storedProvider) {
    return storedProvider
  }

  const resendConfig = {
    apiBaseUrl: DEFAULT_RESEND_API_URL,
    apiKey: '',
    from: '',
    to: '',
    ...(store.get('resendConfig') as Record<string, unknown> | undefined)
  }

  return [resendConfig.apiKey, resendConfig.from, resendConfig.to].some((value) => String(value ?? '').trim())
    ? 'resend'
    : 'smtp'
}

vi.mock('../../src/db', () => ({
  prisma: prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    baseCurrency: 'CNY',
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
    emailProvider: resolveStoredEmailProvider(),
    pushplusNotificationsEnabled: (store.get('pushplusNotificationsEnabled') as boolean) ?? false,
    telegramNotificationsEnabled: (store.get('telegramNotificationsEnabled') as boolean) ?? false,
    serverchanNotificationsEnabled: (store.get('serverchanNotificationsEnabled') as boolean) ?? false,
    gotifyNotificationsEnabled: (store.get('gotifyNotificationsEnabled') as boolean) ?? false,
    smtpConfig: {
      host: '',
      port: DEFAULT_SMTP_PORT,
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
  getResolvedAppLocale: vi.fn(async () => 'zh-CN'),
  setSetting: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  })
}))

vi.mock('../../src/services/worker-lite-repository.service', () => ({
  setSettingLite: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  })
}))

vi.mock('../../src/services/subtracker-backup.service', () => ({
  createSubtrackerBackupArchive: createSubtrackerBackupArchiveMock
}))

import { settingsRoutes } from '../../src/routes/settings'

describe('settings routes validation', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    store.clear()
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

  it('accepts smtp email notifications with a supported port', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        emailNotificationsEnabled: true,
        emailProvider: 'smtp',
        smtpConfig: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          username: 'mailer',
          password: 'secret',
          from: 'SubTracker <noreply@example.com>',
          to: 'user@example.com'
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.emailProvider).toBe('smtp')
  })

  it('rejects smtp port 25 for worker runtime', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        emailNotificationsEnabled: true,
        emailProvider: 'smtp',
        smtpConfig: {
          host: 'smtp.example.com',
          port: 25,
          secure: false,
          username: 'mailer',
          password: 'secret',
          from: 'SubTracker <noreply@example.com>',
          to: 'user@example.com'
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('25 端口')
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
          url: 'http://127.0.0.1:8080',
          token: 'token',
          ignoreSsl: false
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('Gotify URL')
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

  it('exports backup archive', async () => {
    createSubtrackerBackupArchiveMock.mockResolvedValue({
      filename: 'subtracker-backup.zip',
      contentType: 'application/zip',
      buffer: Buffer.from('zip')
    })

    const res = await app.inject({
      method: 'GET',
      url: '/settings/export/backup'
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/zip')
    expect(String(res.headers['content-disposition'])).toContain('subtracker-backup.zip')
  })

  it('persists forgot password toggle', async () => {
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

  it('keeps resend for historical users when provider is missing but resend config exists', async () => {
    store.set('resendConfig', {
      apiBaseUrl: DEFAULT_RESEND_API_URL,
      apiKey: 're_test',
      from: 'SubTracker <noreply@example.com>',
      to: 'user@example.com'
    })

    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        mergeMultiSubscriptionNotifications: false
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.emailProvider).toBe('resend')
  })
})
