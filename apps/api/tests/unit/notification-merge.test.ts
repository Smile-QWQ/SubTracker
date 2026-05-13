import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationState = vi.hoisted(() => ({
  mergeMultiSubscriptionNotifications: true,
  dispatchMock: vi.fn(),
  listReminderScanSubscriptionsDefaultWindowMock: vi.fn(),
  listReminderScanSubscriptionsCustomWindowMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getNotificationScanSettings: vi.fn(async () => ({
    defaultAdvanceReminderRules: '3&09:30;0&09:30;',
    defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
    mergeMultiSubscriptionNotifications: notificationState.mergeMultiSubscriptionNotifications,
    timezone: 'Asia/Shanghai'
  })),
  getNotificationChannelAvailability: vi.fn(async () => ({
    hasEnabledChannel: true,
    primaryWebhookEnabled: true,
    emailNotificationsEnabled: false,
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false
  }))
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  dispatchNotificationEvent: notificationState.dispatchMock
}))

vi.mock('../../src/services/worker-lite-reminder.repository', () => ({
  listReminderScanSubscriptionsDefaultWindow: notificationState.listReminderScanSubscriptionsDefaultWindowMock,
  listReminderScanSubscriptionsCustomWindow: notificationState.listReminderScanSubscriptionsCustomWindowMock
}))

import { scanRenewalNotifications } from '../../src/services/notification.service'

describe('scanRenewalNotifications merge behavior', () => {
  beforeEach(() => {
    notificationState.dispatchMock.mockReset()
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockReset()
    notificationState.listReminderScanSubscriptionsCustomWindowMock.mockReset()
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockResolvedValue([
      {
        id: 'sub-1',
        name: 'Netflix',
        nextRenewalDate: new Date('2026-04-22T16:00:00.000Z'),
        notifyDaysBefore: 3,
        advanceReminderRules: '',
        overdueReminderRules: '',
        amount: 9.9,
        currency: 'USD',
        status: 'active',
        websiteUrl: 'https://netflix.com',
        notes: 'stream',
        webhookEnabled: true,
        tags: [{ tag: { name: '视频' } }]
      },
      {
        id: 'sub-2',
        name: 'Spotify',
        nextRenewalDate: new Date('2026-04-21T16:00:00.000Z'),
        notifyDaysBefore: 5,
        advanceReminderRules: '',
        overdueReminderRules: '',
        amount: 12.9,
        currency: 'USD',
        status: 'active',
        websiteUrl: 'https://spotify.com',
        notes: 'music',
        webhookEnabled: true,
        tags: [{ tag: { name: '音乐' } }]
      },
      {
        id: 'sub-3',
        name: 'Notion',
        nextRenewalDate: new Date('2026-04-25T16:00:00.000Z'),
        notifyDaysBefore: 3,
        advanceReminderRules: '',
        overdueReminderRules: '',
        amount: 8.8,
        currency: 'USD',
        status: 'active',
        websiteUrl: 'https://notion.so',
        notes: 'workspace',
        webhookEnabled: true,
        tags: [{ tag: { name: '办公' } }]
      }
    ])
    notificationState.listReminderScanSubscriptionsCustomWindowMock.mockResolvedValue([])
  })

  it('merges all reminders from the same scan into a single summary notification by default', async () => {
    notificationState.mergeMultiSubscriptionNotifications = true

    await scanRenewalNotifications(new Date('2026-04-23T01:30:00.000Z'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
    const [params] = notificationState.dispatchMock.mock.calls[0]
    const payload = params.payload
    expect(payload.merged).toBe(true)
    expect(payload.mergedCount).toBe(3)
    expect(payload.subscriptions).toHaveLength(3)
    expect(payload.mergedSections).toHaveLength(3)
    expect(payload.mergedSections.map((section: { title: string }) => section.title)).toEqual(['即将到期', '今天到期', '已过期第 1 天'])
    expect(payload.subscriptions.map((item: { nextRenewalDate: string }) => item.nextRenewalDate)).toEqual([
      '2026-04-26',
      '2026-04-23',
      '2026-04-22'
    ])
    expect(params.periodKey).toContain('summary:')
    expect(params.periodKey).toContain('2026-04-23:due_today:advance-0@09:30')
    expect(params.periodKey).toContain('2026-04-22:overdue_day_1:overdue-1@09:30')
  })

  it('sends notifications separately when merging is disabled', async () => {
    notificationState.mergeMultiSubscriptionNotifications = false

    await scanRenewalNotifications(new Date('2026-04-23T01:30:00.000Z'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(3)
    for (const call of notificationState.dispatchMock.mock.calls) {
      expect(call[0].payload.merged).not.toBe(true)
    }
  })

  it('allows same-day makeup dispatch after the configured reminder minute', async () => {
    notificationState.mergeMultiSubscriptionNotifications = false

    await scanRenewalNotifications(new Date('2026-04-23T01:34:00.000Z'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(3)
  })

  it('does not fetch tags for scheduled scan candidates', async () => {
    await scanRenewalNotifications(new Date('2026-04-23T01:30:00.000Z'))

    expect(notificationState.listReminderScanSubscriptionsDefaultWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryStart: expect.any(Date),
        queryEnd: expect.any(Date)
      })
    )
    expect(notificationState.listReminderScanSubscriptionsCustomWindowMock).toHaveBeenCalled()
  })
})
