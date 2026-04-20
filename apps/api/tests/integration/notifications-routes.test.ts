import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notificationMocks = vi.hoisted(() => ({
  sendTestTelegramNotificationMock: vi.fn(),
  sendTestTelegramNotificationWithConfigMock: vi.fn()
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  sendTestEmailNotification: vi.fn(),
  sendTestEmailNotificationWithConfig: vi.fn(),
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
    notificationMocks.sendTestTelegramNotificationMock.mockReset()
    notificationMocks.sendTestTelegramNotificationWithConfigMock.mockReset()
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
})
