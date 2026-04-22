import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/runtime', () => ({
  getWorkerCache: vi.fn(() => undefined)
}))

vi.mock('../../src/config', () => ({
  config: {
    resendApiUrl: 'https://api.resend.com/emails'
  }
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    emailNotificationsEnabled: false,
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    emailConfig: {
      provider: 'resend',
      apiBaseUrl: 'https://api.resend.com/emails',
      apiKey: '',
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
    }
  })),
  getSetting: vi.fn(async () => false),
  setSetting: vi.fn(async () => undefined)
}))

vi.mock('../../src/services/webhook.service', () => ({
  dispatchWebhookEvent: vi.fn(async () => ({
    channel: 'webhook',
    status: 'skipped',
    reason: 'webhook_disabled'
  }))
}))

import { sendTestEmailNotificationWithConfig } from '../../src/services/channel-notification.service'

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
  })

  it('sends Resend email requests with bearer auth and plain-text body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'email_123' }))
    vi.stubGlobal('fetch', fetchMock)

    await sendTestEmailNotificationWithConfig({
      provider: 'resend',
      apiBaseUrl: 'https://api.resend.com/emails',
      apiKey: 're_test_123',
      from: 'SubTracker Lite <noreply@example.com>',
      to: 'user@example.com'
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
})
