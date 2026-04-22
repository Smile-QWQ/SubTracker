import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notificationMocks = vi.hoisted(() => ({
  sendTestEmailNotificationWithConfigMock: vi.fn(),
  sendTestTelegramNotificationMock: vi.fn(),
  sendTestTelegramNotificationWithConfigMock: vi.fn()
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  sendTestEmailNotification: vi.fn(),
  sendTestEmailNotificationWithConfig: notificationMocks.sendTestEmailNotificationWithConfigMock,
  sendTestPushplusNotification: vi.fn(),
  sendTestPushplusNotificationWithConfig: vi.fn(),
  sendTestTelegramNotification: notificationMocks.sendTestTelegramNotificationMock,
  sendTestTelegramNotificationWithConfig: notificationMocks.sendTestTelegramNotificationWithConfigMock
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
    notificationMocks.sendTestEmailNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestTelegramNotificationMock.mockReset()
    notificationMocks.sendTestTelegramNotificationWithConfigMock.mockReset()
    notificationMocks.sendTestEmailNotificationWithConfigMock.mockResolvedValue(undefined)
    notificationMocks.sendTestTelegramNotificationMock.mockResolvedValue({ success: true })
    notificationMocks.sendTestTelegramNotificationWithConfigMock.mockResolvedValue({ success: true })
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

  it('passes resend config through email test endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/test/email',
      payload: {
        provider: 'resend',
        apiBaseUrl: 'https://api.resend.com/emails',
        apiKey: 're_test_123',
        from: 'SubTracker Lite <noreply@example.com>',
        to: 'user@example.com'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(notificationMocks.sendTestEmailNotificationWithConfigMock).toHaveBeenCalledWith({
      provider: 'resend',
      apiBaseUrl: 'https://api.resend.com/emails',
      apiKey: 're_test_123',
      from: 'SubTracker Lite <noreply@example.com>',
      to: 'user@example.com'
    })
  })

})
