import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingsState = vi.hoisted(() => ({
  getNotificationChannelSettingsMock: vi.fn(async () => ({
    emailNotificationsEnabled: true,
    emailProvider: 'resend',
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false,
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
      apiBaseUrl: 'https://api.resend.com/emails',
      apiKey: 're_test_123',
      from: 'SubTracker Lite <noreply@example.com>',
      to: 'user@example.com'
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
    }
  }))
}))

vi.mock('../../src/config', () => ({
  config: {
    resendApiUrl: 'https://api.resend.com/emails'
  }
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppTimezone: vi.fn(async () => 'Asia/Shanghai'),
  getNotificationChannelSettings: settingsState.getNotificationChannelSettingsMock
}))

vi.mock('../../src/services/webhook.service', () => ({
  dispatchWebhookEvent: vi.fn(async () => ({
    channel: 'webhook',
    status: 'skipped',
    reason: 'webhook_disabled'
  }))
}))

vi.mock('../../src/services/worker-lite-state.service', () => ({
  claimNotificationDelivery: vi.fn(async () => true),
  releaseNotificationDelivery: vi.fn(async () => undefined),
  storeImportPreview: vi.fn(),
  getImportPreview: vi.fn(),
  deleteImportPreview: vi.fn()
}))

import {
  formatNotificationDate,
  sendForgotPasswordVerificationCode,
  sendTestEmailNotificationWithConfig
} from '../../src/services/channel-notification.service'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

describe('channel notification service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    settingsState.getNotificationChannelSettingsMock.mockClear()
  })

  it('reads notification channel settings only once per dispatch', async () => {
    const { dispatchNotificationEvent } = await import('../../src/services/channel-notification.service')
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'email_123' }))
    vi.stubGlobal('fetch', fetchMock)

    await dispatchNotificationEvent({
      eventType: 'subscription.reminder_due',
      resourceKey: 'subscription:single',
      periodKey: '2026-05-14:single',
      payload: {
        id: 'sub_1',
        name: '单个订阅',
        nextRenewalDate: '2026-05-15',
        amount: 10,
        currency: 'USD',
        tagNames: [],
        websiteUrl: '',
        notes: '',
        phase: 'upcoming',
        daysUntilRenewal: 1,
        daysOverdue: 0
      }
    })

    expect(settingsState.getNotificationChannelSettingsMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends Resend email requests with bearer auth and plain-text body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'email_123' }))
    vi.stubGlobal('fetch', fetchMock)

    await sendTestEmailNotificationWithConfig({
      emailProvider: 'resend',
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
        apiBaseUrl: 'https://api.resend.com/emails',
        apiKey: 're_test_123',
        from: 'SubTracker Lite <noreply@example.com>',
        to: 'user@example.com'
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchMock.mock.calls[0] as unknown) as [string, RequestInit]
    const payload = JSON.parse(String(init.body))

    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer re_test_123',
      'Content-Type': 'application/json'
    })
    expect(payload).toMatchObject({
      from: 'SubTracker Lite <noreply@example.com>',
      to: ['user@example.com'],
      subject: expect.any(String),
      text: expect.stringContaining('测试订阅')
    })
  })

  it('formats ISO date strings to date-only output', () => {
    expect(formatNotificationDate('2026-04-24T16:00:00.000Z')).toBe('2026-04-24')
  })

  it('sends forgot password verification codes through direct channels', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'email_123' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendForgotPasswordVerificationCode({
      username: 'admin',
      code: '123456',
      expiresInMinutes: 10
    })

    expect(result.some((item) => item.channel === 'email' && item.status === 'success')).toBe(true)
    const [url, init] = (fetchMock.mock.calls[0] as unknown) as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(url).toBe('https://api.resend.com/emails')
    expect(payload.subject).toContain('密码重置验证码')
    expect(payload.text).toContain('验证码：123456')
  })
})
