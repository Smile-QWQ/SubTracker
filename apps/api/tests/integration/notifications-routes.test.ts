import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notificationMocks = vi.hoisted(() => ({
  sendTestEmailNotificationMock: vi.fn(),
  sendTestEmailNotificationWithConfigMock: vi.fn(),
  sendTestPushplusNotificationMock: vi.fn(),
  sendTestPushplusNotificationWithConfigMock: vi.fn(),
  sendTestTelegramNotificationMock: vi.fn(),
  sendTestTelegramNotificationWithConfigMock: vi.fn(),
  sendTestServerchanNotificationMock: vi.fn(),
  sendTestServerchanNotificationWithConfigMock: vi.fn(),
  sendTestGotifyNotificationMock: vi.fn(),
  sendTestGotifyNotificationWithConfigMock: vi.fn()
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  sendTestEmailNotification: notificationMocks.sendTestEmailNotificationMock,
  sendTestEmailNotificationWithConfig: notificationMocks.sendTestEmailNotificationWithConfigMock,
  sendTestPushplusNotification: notificationMocks.sendTestPushplusNotificationMock,
  sendTestPushplusNotificationWithConfig: notificationMocks.sendTestPushplusNotificationWithConfigMock,
  sendTestTelegramNotification: notificationMocks.sendTestTelegramNotificationMock,
  sendTestTelegramNotificationWithConfig: notificationMocks.sendTestTelegramNotificationWithConfigMock,
  sendTestServerchanNotification: notificationMocks.sendTestServerchanNotificationMock,
  sendTestServerchanNotificationWithConfig: notificationMocks.sendTestServerchanNotificationWithConfigMock,
  sendTestGotifyNotification: notificationMocks.sendTestGotifyNotificationMock,
  sendTestGotifyNotificationWithConfig: notificationMocks.sendTestGotifyNotificationWithConfigMock
}))

vi.mock('../../src/services/webhook.service', () => ({
  getPrimaryWebhookEndpoint: vi.fn(async () => ({
    enabled: false,
    url: '',
    requestMethod: 'POST',
    headers: 'Content-Type: application/json',
    payloadTemplate: '{}',
    ignoreSsl: false
  })),
  sendTestWebhookNotification: vi.fn(),
  sendTestWebhookNotificationWithConfig: vi.fn(),
  upsertPrimaryWebhookEndpoint: vi.fn()
}))

import { notificationRoutes } from '../../src/routes/notifications'

describe('notification routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await notificationRoutes(app)
    notificationMocks.sendTestEmailNotificationMock.mockReset()
    notificationMocks.sendTestEmailNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestPushplusNotificationMock.mockReset()
    notificationMocks.sendTestPushplusNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestTelegramNotificationMock.mockReset()
    notificationMocks.sendTestTelegramNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestServerchanNotificationMock.mockReset()
    notificationMocks.sendTestServerchanNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestGotifyNotificationMock.mockReset()
    notificationMocks.sendTestGotifyNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestEmailNotificationMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestEmailNotificationWithConfigMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestPushplusNotificationMock.mockResolvedValue({ accepted: true, message: 'ok' })
    notificationMocks.sendTestPushplusNotificationWithConfigMock.mockResolvedValue({ accepted: true, message: 'ok' })
    notificationMocks.sendTestTelegramNotificationMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestTelegramNotificationWithConfigMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestServerchanNotificationMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestServerchanNotificationWithConfigMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestGotifyNotificationMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestGotifyNotificationWithConfigMock.mockResolvedValue({ success: true })
  })

  afterEach(async () => {
    await app.close()
  })

  it('tests telegram notification with stored config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/test/telegram'
    })

    expect(res.statusCode).toBe(200)
    expect(notificationMocks.sendTestTelegramNotificationMock).toHaveBeenCalled()
  })

  it('tests resend email notification with payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/test/email',
      payload: {
        emailProvider: 'resend',
        resendConfig: {
          apiBaseUrl: 'https://api.resend.com/emails',
          apiKey: 're_test',
          from: 'SubTracker <noreply@example.com>',
          to: 'user@example.com'
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(notificationMocks.sendTestEmailNotificationWithConfigMock).toHaveBeenCalledWith({
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
        apiKey: 're_test',
        from: 'SubTracker <noreply@example.com>',
        to: 'user@example.com'
      }
    })
  })

  it('tests serverchan notification with stored config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/test/serverchan'
    })

    expect(res.statusCode).toBe(200)
    expect(notificationMocks.sendTestServerchanNotificationMock).toHaveBeenCalled()
  })

  it('tests gotify notification with payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/test/gotify',
      payload: {
        url: 'https://gotify.example.com',
        token: 'token',
        ignoreSsl: false
      }
    })

    expect(res.statusCode).toBe(200)
    expect(notificationMocks.sendTestGotifyNotificationWithConfigMock).toHaveBeenCalled()
  })

})
