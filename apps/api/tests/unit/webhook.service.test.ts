import { beforeEach, describe, expect, it, vi } from 'vitest'

const webhookState = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  setSettingMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getSetting: webhookState.getSettingMock,
  setSetting: webhookState.setSettingMock
}))

vi.mock('../../src/db', () => ({
  prisma: {
    webhookDelivery: {
      findUnique: webhookState.findUniqueMock,
      create: webhookState.createMock,
      update: webhookState.updateMock
    }
  }
}))

import { dispatchWebhookEvent } from '../../src/services/webhook.service'

function mockFetch(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      text: async () => body
    }))
  )
}

describe('webhook service', () => {
  const baseParams = {
    eventType: 'subscription.reminder_due' as const,
    resourceKey: 'subscription:1',
    periodKey: '2026-05-01:upcoming:advance-3@09:30',
    subscriptionId: 'sub_1',
    payload: {
      id: 'sub_1',
      name: '示例订阅',
      nextRenewalDate: '2026-05-04',
      phase: 'upcoming'
    }
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    webhookState.getSettingMock.mockReset()
    webhookState.setSettingMock.mockReset()
    webhookState.findUniqueMock.mockReset()
    webhookState.createMock.mockReset()
    webhookState.updateMock.mockReset()
    webhookState.getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'https://example.com/webhook',
      requestMethod: 'POST',
      headers: 'Content-Type: application/json',
      payloadTemplate: '{"phase":"{{phase}}","name":"{{subscription_name}}"}',
      ignoreSsl: false
    })
  })

  it('skips webhook dispatch when the periodKey already succeeded', async () => {
    webhookState.findUniqueMock.mockResolvedValue({
      id: 'delivery_1',
      attemptCount: 1,
      status: 'success'
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(dispatchWebhookEvent(baseParams)).resolves.toEqual({
      channel: 'webhook',
      status: 'skipped',
      message: 'webhook_already_sent'
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(webhookState.updateMock).not.toHaveBeenCalled()
    expect(webhookState.createMock).not.toHaveBeenCalled()
  })

  it('retries webhook dispatch when the previous attempt failed', async () => {
    webhookState.findUniqueMock.mockResolvedValue({
      id: 'delivery_1',
      attemptCount: 1,
      status: 'failed'
    })
    mockFetch(200, 'ok')

    await expect(dispatchWebhookEvent(baseParams)).resolves.toEqual({
      channel: 'webhook',
      status: 'success'
    })

    expect(webhookState.updateMock).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({
        status: 'success',
        responseCode: 200,
        responseBody: 'ok',
        attemptCount: 2
      })
    })
  })

  it('records failed first-time webhook attempts', async () => {
    webhookState.findUniqueMock.mockResolvedValue(null)
    mockFetch(500, 'server error')

    await expect(dispatchWebhookEvent(baseParams)).rejects.toThrow('Webhook dispatch failed: HTTP 500')

    expect(webhookState.createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:1',
        periodKey: '2026-05-01:upcoming:advance-3@09:30',
        status: 'failed',
        responseCode: 500,
        responseBody: 'server error',
        attemptCount: 1
      })
    })
  })

  it('records network failures as failed webhook attempts', async () => {
    webhookState.findUniqueMock.mockResolvedValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )

    await expect(dispatchWebhookEvent(baseParams)).rejects.toThrow('network down')

    expect(webhookState.createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        responseCode: 0,
        responseBody: 'network down',
        attemptCount: 1
      })
    })
  })

  it('records successful first-time webhook attempts', async () => {
    webhookState.findUniqueMock.mockResolvedValue(null)
    mockFetch(200, 'ok')

    await expect(dispatchWebhookEvent(baseParams)).resolves.toEqual({
      channel: 'webhook',
      status: 'success'
    })

    expect(webhookState.createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:1',
        periodKey: '2026-05-01:upcoming:advance-3@09:30',
        status: 'success',
        responseCode: 200,
        responseBody: 'ok',
        attemptCount: 1
      })
    })
  })
})
