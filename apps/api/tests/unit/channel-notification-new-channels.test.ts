import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationDispatchParams } from '../../src/services/notification-merge.service'

const channelState = vi.hoisted(() => {
  const store = new Map<string, unknown>()

  const settings = {
    emailNotificationsEnabled: false,
    emailProvider: 'smtp' as const,
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false,
    barkNotificationsEnabled: false,
    notifyxNotificationsEnabled: false,
    appriseNotificationsEnabled: false,
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
      apiBaseUrl: '',
      apiKey: '',
      from: '',
      to: ''
    },
    pushplusConfig: { token: '', topic: '' },
    telegramConfig: { botToken: '', chatId: '' },
    serverchanConfig: { sendkey: '' },
    gotifyConfig: { url: '', token: '', ignoreSsl: false },
    barkConfig: { serverUrl: '', deviceKey: '', isArchive: false },
    notifyxConfig: { apiKey: '', team: '' },
    appriseConfig: {
      apiBaseUrl: '',
      key: '',
      ignoreSsl: false,
      targets: [] as Array<{ id: string; name: string; url: string; enabled: boolean }>,
      lastSyncStatus: 'idle' as 'idle' | 'synced' | 'failed',
      lastSyncAt: null as string | null,
      lastSyncError: null as string | null
    }
  }

  return {
    fetchMock: vi.fn(),
    createTransportMock: vi.fn(() => ({
      sendMail: vi.fn()
    })),
    getAppTimezoneMock: vi.fn(async () => 'Asia/Shanghai'),
    getNotificationChannelSettingsMock: vi.fn(async () => ({ ...settings })),
    getSettingMock: vi.fn(async <T>(key: string, fallback: T) => (store.has(key) ? (store.get(key) as T) : fallback)),
    getResolvedAppLocaleMock: vi.fn(async () => 'zh-CN'),
    setSettingMock: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
    validateNotificationTargetUrlMock: vi.fn((url: string) => new URL(url)),
    dispatchWebhookEventMock: vi.fn(async () => ({
      channel: 'webhook' as const,
      status: 'skipped' as const,
      message: 'webhook_disabled'
    })),
    prismaSettingDeleteManyMock: vi.fn(),
    resetStore() {
      store.clear()
    },
    seedSentKey(key: string) {
      store.set(key, true)
    },
    configureSettings(overrides: Partial<typeof settings>) {
      Object.assign(settings, overrides)
    },
    resetSettings() {
      settings.emailNotificationsEnabled = false
      settings.pushplusNotificationsEnabled = false
      settings.telegramNotificationsEnabled = false
      settings.serverchanNotificationsEnabled = false
      settings.gotifyNotificationsEnabled = false
      settings.barkNotificationsEnabled = false
      settings.notifyxNotificationsEnabled = false
      settings.appriseNotificationsEnabled = false
      settings.barkConfig = { serverUrl: '', deviceKey: '', isArchive: false }
      settings.notifyxConfig = { apiKey: '', team: '' }
      settings.appriseConfig = {
        apiBaseUrl: '',
        key: '',
        ignoreSsl: false,
        targets: [],
        lastSyncStatus: 'idle' as 'idle' | 'synced' | 'failed',
        lastSyncAt: null as string | null,
        lastSyncError: null as string | null
      }
    }
  }
})

vi.mock('nodemailer', () => ({
  default: {
    createTransport: channelState.createTransportMock
  }
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppTimezone: channelState.getAppTimezoneMock,
  getNotificationChannelSettings: channelState.getNotificationChannelSettingsMock,
  getResolvedAppLocale: channelState.getResolvedAppLocaleMock,
  getSetting: channelState.getSettingMock,
  setSetting: channelState.setSettingMock
}))

vi.mock('../../src/services/notification-url.service', () => ({
  validateNotificationTargetUrl: channelState.validateNotificationTargetUrlMock
}))

vi.mock('../../src/services/webhook.service', () => ({
  dispatchWebhookEvent: channelState.dispatchWebhookEventMock
}))

vi.mock('../../src/db', () => ({
  prisma: {
    setting: {
      deleteMany: channelState.prismaSettingDeleteManyMock
    }
  }
}))

const dispatchParams: NotificationDispatchParams = {
  eventType: 'subscription.reminder_due',
  resourceKey: 'subscription:test-subscription',
  periodKey: '2026-05-28:upcoming:advance-3@09:30',
  payload: {
    id: 'sub_test',
    name: 'Test Subscription',
    nextRenewalDate: '2026-05-31',
    notifyDaysBefore: 3,
    amount: 19.9,
    currency: 'CNY',
    status: 'active',
    tagNames: ['影音'],
    websiteUrl: 'https://example.com',
    notes: 'demo',
    phase: 'upcoming',
    daysUntilRenewal: 3,
    daysOverdue: 0,
    reminderRuleTime: '09:30',
    reminderRuleDays: 3
  }
}

function mockFetchResponse(options: { status: number; body: string }) {
  channelState.fetchMock.mockResolvedValueOnce({
    ok: options.status >= 200 && options.status < 300,
    status: options.status,
    text: vi.fn(async () => options.body)
  })
}

describe('channel notification new direct channels', () => {
  beforeEach(() => {
    vi.resetModules()
    channelState.fetchMock.mockReset()
    channelState.createTransportMock.mockClear()
    channelState.getAppTimezoneMock.mockClear()
    channelState.getNotificationChannelSettingsMock.mockClear()
    channelState.getResolvedAppLocaleMock.mockClear()
    channelState.getSettingMock.mockClear()
    channelState.setSettingMock.mockClear()
    channelState.validateNotificationTargetUrlMock.mockClear()
    channelState.dispatchWebhookEventMock.mockClear()
    channelState.resetStore()
    channelState.resetSettings()
    vi.stubGlobal('fetch', channelState.fetchMock)
  })

  it('sends bark test notifications with the expected payload', async () => {
    mockFetchResponse({
      status: 200,
      body: JSON.stringify({ code: 200, message: 'success' })
    })

    const { sendTestBarkNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestBarkNotificationWithConfig({
        serverUrl: 'https://api.day.app',
        deviceKey: 'device-key',
        isArchive: true
      })
    ).resolves.toEqual({ success: true })

    const [url, init] = channelState.fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.day.app/push')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      device_key: 'device-key',
      isArchive: 1
    })
  })

  it('rejects bark test notifications when config is incomplete', async () => {
    const { sendTestBarkNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestBarkNotificationWithConfig({
        serverUrl: '',
        deviceKey: '',
        isArchive: false
      })
    ).rejects.toThrow('Bark')
  })

  it('rejects bark test notifications on non-2xx responses', async () => {
    mockFetchResponse({
      status: 500,
      body: '{"message":"server error"}'
    })

    const { sendTestBarkNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestBarkNotificationWithConfig({
        serverUrl: 'https://api.day.app',
        deviceKey: 'device-key',
        isArchive: false
      })
    ).rejects.toThrow('HTTP 500')
  })

  it('rejects bark test notifications when the response body is invalid', async () => {
    mockFetchResponse({
      status: 200,
      body: 'not-json'
    })

    const { sendTestBarkNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestBarkNotificationWithConfig({
        serverUrl: 'https://api.day.app',
        deviceKey: 'device-key',
        isArchive: false
      })
    ).rejects.toThrow('无法解析的响应')
  })

  it('rejects bark test notifications when bark rejects the request', async () => {
    mockFetchResponse({
      status: 200,
      body: JSON.stringify({ code: 400, message: 'rejected' })
    })

    const { sendTestBarkNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestBarkNotificationWithConfig({
        serverUrl: 'https://api.day.app',
        deviceKey: 'device-key',
        isArchive: false
      })
    ).rejects.toThrow('rejected')
  })

  it('sends notifyx test notifications with markdown-friendly payload', async () => {
    mockFetchResponse({
      status: 200,
      body: JSON.stringify({ status: 'queued', message: 'ok', id: 1 })
    })

    const { sendTestNotifyxNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestNotifyxNotificationWithConfig({
        apiKey: 'notifyx-key',
        team: 'team-id'
      })
    ).resolves.toEqual({ success: true })

    const [url, init] = channelState.fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://www.notifyx.cn/api/v1/send/notifyx-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      team: 'team-id'
    })
  })

  it('rejects notifyx test notifications when api key is missing', async () => {
    const { sendTestNotifyxNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestNotifyxNotificationWithConfig({
        apiKey: '',
        team: ''
      })
    ).rejects.toThrow('NotifyX')
  })

  it('rejects notifyx test notifications on non-2xx responses', async () => {
    mockFetchResponse({
      status: 400,
      body: '{"message":"bad request"}'
    })

    const { sendTestNotifyxNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestNotifyxNotificationWithConfig({
        apiKey: 'notifyx-key',
        team: ''
      })
    ).rejects.toThrow('HTTP 400')
  })

  it('rejects notifyx test notifications when the response body is invalid', async () => {
    mockFetchResponse({
      status: 200,
      body: 'not-json'
    })

    const { sendTestNotifyxNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestNotifyxNotificationWithConfig({
        apiKey: 'notifyx-key',
        team: ''
      })
    ).rejects.toThrow('无法解析的响应')
  })

  it('rejects notifyx test notifications when notifyx does not queue the message', async () => {
    mockFetchResponse({
      status: 200,
      body: JSON.stringify({ status: 'failed', message: 'rejected' })
    })

    const { sendTestNotifyxNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestNotifyxNotificationWithConfig({
        apiKey: 'notifyx-key',
        team: ''
      })
    ).rejects.toThrow('rejected')
  })

  it('marks bark dispatches as sent and skips repeated dispatches', async () => {
    channelState.configureSettings({
      barkNotificationsEnabled: true,
      barkConfig: {
        serverUrl: 'https://api.day.app',
        deviceKey: 'device-key',
        isArchive: false
      }
    })
    mockFetchResponse({
      status: 200,
      body: JSON.stringify({ code: 200, message: 'success' })
    })

    const { dispatchNotificationEvent } = await import('../../src/services/channel-notification.service')
    const firstResults = await dispatchNotificationEvent(dispatchParams)
    expect(firstResults.find((result) => result.channel === 'bark')).toMatchObject({ status: 'success' })
    expect(channelState.setSettingMock).toHaveBeenCalledWith(
      'notification:bark:subscription.reminder_due:subscription:test-subscription:2026-05-28:upcoming:advance-3@09:30',
      true
    )

    channelState.fetchMock.mockClear()
    const secondResults = await dispatchNotificationEvent(dispatchParams)
    expect(secondResults.find((result) => result.channel === 'bark')).toMatchObject({
      status: 'skipped',
      message: 'bark_already_sent'
    })
    expect(channelState.fetchMock).not.toHaveBeenCalled()
  })

  it('includes notifyx in forgot-password channel dispatch results', async () => {
    channelState.configureSettings({
      notifyxNotificationsEnabled: true,
      notifyxConfig: {
        apiKey: 'notifyx-key',
        team: 'team-id'
      }
    })
    mockFetchResponse({
      status: 200,
      body: JSON.stringify({ status: 'queued', message: 'ok', id: 1 })
    })

    const { sendForgotPasswordVerificationCode } = await import('../../src/services/channel-notification.service')
    const results = await sendForgotPasswordVerificationCode({
      username: 'admin',
      code: '123456',
      expiresInMinutes: 10
    })

    expect(results.find((result) => result.channel === 'notifyx')).toMatchObject({ status: 'success' })
    expect(results.find((result) => result.channel === 'bark')).toMatchObject({ status: 'skipped', message: 'bark_disabled' })
  })

  it('sends apprise test notifications through a temporary stateful key and cleans it up afterwards', async () => {
    mockFetchResponse({
      status: 200,
      body: '{"status":"ok"}'
    })
    mockFetchResponse({
      status: 200,
      body: '{"status":"ok"}'
    })
    mockFetchResponse({
      status: 200,
      body: '{"status":"ok"}'
    })

    const { sendTestAppriseNotificationWithConfig } = await import('../../src/services/channel-notification.service')
    await expect(
      sendTestAppriseNotificationWithConfig({
        apiBaseUrl: 'https://apprise.example.com/base',
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
        lastSyncStatus: 'idle',
        lastSyncAt: null,
        lastSyncError: null
      }, {
        targetId: 'target-1'
      })
    ).resolves.toEqual({ success: true })

    expect(String(channelState.fetchMock.mock.calls[0]?.[0])).toContain('/base/add/')
    expect(JSON.parse(String(channelState.fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      format: 'text'
    })
    expect(String(channelState.fetchMock.mock.calls[1]?.[0])).toContain('/base/notify/')
    expect(JSON.parse(String(channelState.fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      tag: 'st-target-target-1'
    })
    expect(String(channelState.fetchMock.mock.calls[2]?.[0])).toContain('/base/del/')
  })

  it('marks apprise dispatches as sent and skips repeated dispatches', async () => {
    channelState.configureSettings({
      appriseNotificationsEnabled: true,
      appriseConfig: {
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
      }
    })
    mockFetchResponse({
      status: 200,
      body: '{"status":"ok"}'
    })

    const { dispatchNotificationEvent } = await import('../../src/services/channel-notification.service')
    const firstResults = await dispatchNotificationEvent(dispatchParams)
    expect(firstResults.find((result) => result.channel === 'apprise')).toMatchObject({ status: 'success' })
    expect(channelState.setSettingMock).toHaveBeenCalledWith(
      'notification:apprise:subscription.reminder_due:subscription:test-subscription:2026-05-28:upcoming:advance-3@09:30',
      true
    )

    channelState.fetchMock.mockClear()
    const secondResults = await dispatchNotificationEvent(dispatchParams)
    expect(secondResults.find((result) => result.channel === 'apprise')).toMatchObject({
      status: 'skipped',
      message: 'apprise_already_sent'
    })
    expect(channelState.fetchMock).not.toHaveBeenCalled()
  })

  it('includes apprise in forgot-password channel dispatch results', async () => {
    channelState.configureSettings({
      appriseNotificationsEnabled: true,
      appriseConfig: {
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
        lastSyncStatus: 'failed',
        lastSyncAt: null,
        lastSyncError: 'temporary failure'
      }
    })
    mockFetchResponse({
      status: 200,
      body: '{"status":"ok"}'
    })
    mockFetchResponse({
      status: 200,
      body: '{"status":"ok"}'
    })

    const { sendForgotPasswordVerificationCode } = await import('../../src/services/channel-notification.service')
    const results = await sendForgotPasswordVerificationCode({
      username: 'admin',
      code: '123456',
      expiresInMinutes: 10
    })

    expect(results.find((result) => result.channel === 'apprise')).toMatchObject({ status: 'success' })
    expect(String(channelState.fetchMock.mock.calls[0]?.[0])).toBe('https://apprise.example.com/add/subtracker-main')
    expect(String(channelState.fetchMock.mock.calls[1]?.[0])).toBe('https://apprise.example.com/notify/subtracker-main')
  })
})
