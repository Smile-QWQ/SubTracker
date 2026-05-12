import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type NotificationDedupEntry, type NotificationDispatchParams } from '../../src/services/notification-merge.service'

const channelState = vi.hoisted(() => {
  const store = new Map<string, unknown>()

  const dedupEntries: NotificationDedupEntry[] = [
    {
      eventType: 'subscription.reminder_due' as const,
      resourceKey: 'subscription:sub-1',
      periodKey: '2026-05-01:due_today:advance-0@09:30',
      subscriptionId: 'sub-1',
      phase: 'due_today',
      payload: {
        id: 'sub-1',
        name: 'Netflix',
        nextRenewalDate: '2026-05-01',
        notifyDaysBefore: 0,
        amount: 10,
        currency: 'USD',
        status: 'active',
        tagNames: ['视频'],
        websiteUrl: 'https://netflix.com',
        notes: '',
        phase: 'due_today',
        daysUntilRenewal: 0,
        daysOverdue: 0,
        reminderRuleTime: '09:30',
        reminderRuleDays: 0
      }
    },
    {
      eventType: 'subscription.overdue' as const,
      resourceKey: 'subscription:sub-2',
      periodKey: '2026-04-30:overdue_day_1:overdue-1@09:30',
      subscriptionId: 'sub-2',
      phase: 'overdue_day_1',
      payload: {
        id: 'sub-2',
        name: 'Spotify',
        nextRenewalDate: '2026-04-30',
        notifyDaysBefore: 0,
        amount: 20,
        currency: 'USD',
        status: 'expired',
        tagNames: ['音乐'],
        websiteUrl: 'https://spotify.com',
        notes: '',
        phase: 'overdue',
        daysUntilRenewal: 0,
        daysOverdue: 1,
        reminderRuleTime: '09:30',
        reminderRuleDays: 1
      }
    }
  ]

  return {
    createTransportMock: vi.fn(() => ({
      sendMail: channelState.sendMailMock
    })),
    sendMailMock: vi.fn(),
    getAppTimezoneMock: vi.fn(async () => 'Asia/Shanghai'),
    getNotificationChannelSettingsMock: vi.fn(async () => ({
      emailNotificationsEnabled: true,
      emailProvider: 'smtp' as const,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false,
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'demo',
        password: 'demo',
        from: 'from@example.com',
        to: 'to@example.com'
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
      gotifyConfig: { url: '', token: '', ignoreSsl: false }
    })),
    getSettingMock: vi.fn(async <T>(key: string, fallback: T) => (store.has(key) ? (store.get(key) as T) : fallback)),
    setSettingMock: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
    validateNotificationTargetUrlMock: vi.fn((url: string) => new URL(url)),
    prismaSettingDeleteManyMock: vi.fn(),
    resetStore() {
      store.clear()
    },
    seedSentKeys(keys: string[]) {
      for (const key of keys) store.set(key, true)
    },
    getStoredKeys() {
      return Array.from(store.keys()).sort()
    },
    dedupEntries,
    dispatchWebhookEventMock: vi.fn(async () => ({
      channel: 'webhook' as const,
      status: 'skipped' as const,
      message: 'webhook_disabled'
    }))
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

const baseMergedParams: NotificationDispatchParams = {
  eventType: 'subscription.overdue' as const,
  resourceKey: 'subscriptions:scan-summary',
  periodKey:
    '2026-05-01:summary:2026-04-30:overdue_day_1:overdue-1@09:30|2026-05-01:due_today:advance-0@09:30',
  payload: {
    merged: true,
    mergedCount: 2,
    mergedSections: [
      {
        phase: 'due_today',
        title: '今天到期',
        eventType: 'subscription.reminder_due' as const,
        subscriptions: [channelState.dedupEntries[0].payload]
      },
      {
        phase: 'overdue_day_1',
        title: '已过期第 1 天',
        eventType: 'subscription.overdue' as const,
        subscriptions: [channelState.dedupEntries[1].payload]
      }
    ],
    name: '共 2 项订阅',
    nextRenewalDate: '2026-05-01',
    notifyDaysBefore: 0,
    amount: 30,
    currency: 'USD',
    status: 'expired',
    tagNames: [],
    websiteUrl: '',
    notes: '',
    phase: 'summary',
    daysUntilRenewal: 0,
    daysOverdue: 1,
    reminderRuleTime: '09:30',
    reminderRuleDays: 0,
    subscriptions: channelState.dedupEntries.map((entry) => entry.payload)
  },
  dedupEntries: channelState.dedupEntries
}

describe('channel notification dedup for merged reminders', () => {
  beforeEach(() => {
    vi.resetModules()
    channelState.sendMailMock.mockReset()
    channelState.createTransportMock.mockClear()
    channelState.getSettingMock.mockClear()
    channelState.setSettingMock.mockClear()
    channelState.getNotificationChannelSettingsMock.mockClear()
    channelState.dispatchWebhookEventMock.mockClear()
    channelState.resetStore()
    channelState.sendMailMock.mockResolvedValue(undefined)
  })

  it('skips direct-channel resend when all dedup entries were already delivered', async () => {
    channelState.seedSentKeys([
      'notification:email:subscription.reminder_due:subscription:sub-1:2026-05-01:due_today:advance-0@09:30',
      'notification:email:subscription.overdue:subscription:sub-2:2026-04-30:overdue_day_1:overdue-1@09:30'
    ])

    const { dispatchNotificationEvent } = await import('../../src/services/channel-notification.service')
    const results = await dispatchNotificationEvent(baseMergedParams)

    expect(channelState.sendMailMock).not.toHaveBeenCalled()
    expect(results.find((result) => result.channel === 'email')).toMatchObject({
      status: 'skipped',
      message: 'email_already_sent'
    })
  })

  it('downgrades to a single-notification template when only one merged entry is still pending', async () => {
    channelState.seedSentKeys([
      'notification:email:subscription.overdue:subscription:sub-2:2026-04-30:overdue_day_1:overdue-1@09:30'
    ])

    const { dispatchNotificationEvent } = await import('../../src/services/channel-notification.service')
    const results = await dispatchNotificationEvent(baseMergedParams)

    expect(channelState.sendMailMock).toHaveBeenCalledTimes(1)
    expect(channelState.sendMailMock.mock.calls[0][0]).toMatchObject({
      subject: '今天到期：Netflix'
    })
    expect(channelState.sendMailMock.mock.calls[0][0].text).toContain('订阅名称：Netflix')
    expect(channelState.sendMailMock.mock.calls[0][0].text).not.toContain('订阅数量：')
    expect(results.find((result) => result.channel === 'email')).toMatchObject({
      status: 'success'
    })
    expect(channelState.setSettingMock).toHaveBeenCalledTimes(1)
    expect(channelState.setSettingMock.mock.calls[0][0]).toBe(
      'notification:email:subscription.reminder_due:subscription:sub-1:2026-05-01:due_today:advance-0@09:30'
    )
  })

  it('rebuilds merged content from pending entries only', async () => {
    channelState.seedSentKeys([
      'notification:email:subscription.reminder_due:subscription:sub-1:2026-05-01:due_today:advance-0@09:30'
    ])

    const { dispatchNotificationEvent } = await import('../../src/services/channel-notification.service')
    await dispatchNotificationEvent(baseMergedParams)

    expect(channelState.sendMailMock).toHaveBeenCalledTimes(1)
    const message = channelState.sendMailMock.mock.calls[0][0]
    expect(message.subject).toBe('已过期第 1 天：Spotify')
    expect(message.text).toContain('订阅名称：Spotify')
    expect(message.text).not.toContain('今天到期（1 项）')
  })
})
