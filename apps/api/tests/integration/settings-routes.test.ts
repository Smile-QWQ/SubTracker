import Fastify, { type FastifyInstance } from 'fastify'
import { DEFAULT_RESEND_API_URL } from '@subtracker/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

const prismaMock = vi.hoisted(() => ({}))

vi.mock('../../src/db', () => ({
  prisma: prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    defaultNotifyDays: 3,
    defaultAdvanceReminderRules: '3&09:30;0&09:30;',
    rememberSessionDays: 7,
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
    aiConfig: {
      enabled: false,
      providerPreset: 'custom',
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      timeoutMs: 30000,
      promptTemplate: '',
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
    app = Fastify()
    await settingsRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects incomplete AI config when enabling AI recognition', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings',
      payload: {
        aiConfig: {
          enabled: true,
          providerPreset: 'custom',
          providerName: '',
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          model: '',
          timeoutMs: 30000,
          promptTemplate: '',
          capabilities: {
            vision: false,
            structuredOutput: true
          }
        }
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain('启用 AI 识别时必须填写')
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

})
