import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationState = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  listReminderScanSubscriptionsDefaultWindowMock: vi.fn(),
  listReminderScanSubscriptionsCustomWindowMock: vi.fn(),
  defaultAdvanceReminderRules: '3&09:30;0&09:30;',
  defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
  mergeMultiSubscriptionNotifications: false,
  timezone: 'Asia/Shanghai'
}))

const notificationSettingsMocks = vi.hoisted(() => ({
  getNotificationScanSettingsMock: vi.fn(async () => ({
    defaultAdvanceReminderRules: notificationState.defaultAdvanceReminderRules,
    defaultOverdueReminderRules: notificationState.defaultOverdueReminderRules,
    mergeMultiSubscriptionNotifications: notificationState.mergeMultiSubscriptionNotifications,
    timezone: notificationState.timezone
  })),
  getNotificationChannelAvailabilityMock: vi.fn(async () => ({
    hasEnabledChannel: true,
    primaryWebhookEnabled: true,
    emailNotificationsEnabled: false,
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false
  }))
}))

vi.mock('../../src/services/settings.service', () => ({
  getNotificationScanSettings: notificationSettingsMocks.getNotificationScanSettingsMock,
  getNotificationChannelAvailability: notificationSettingsMocks.getNotificationChannelAvailabilityMock
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  dispatchNotificationEvent: notificationState.dispatchMock
}))

vi.mock('../../src/services/worker-lite-reminder.repository', () => ({
  listReminderScanSubscriptionsDefaultWindow: notificationState.listReminderScanSubscriptionsDefaultWindowMock,
  listReminderScanSubscriptionsCustomWindow: notificationState.listReminderScanSubscriptionsCustomWindowMock
}))

import { scanRenewalNotifications } from '../../src/services/notification.service'

const subscription = {
  id: 'sub-1',
  name: 'GitHub',
  nextRenewalDate: new Date('2026-05-04T00:00:00+08:00'),
  notifyDaysBefore: 3,
  advanceReminderRules: '',
  overdueReminderRules: '',
  amount: 10,
  currency: 'USD',
  status: 'active',
  webhookEnabled: true,
  websiteUrl: 'https://github.com',
  notes: '',
  tags: []
}

describe('scanRenewalNotifications reminder makeup window', () => {
  beforeEach(() => {
    notificationState.dispatchMock.mockReset()
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockReset()
    notificationState.listReminderScanSubscriptionsCustomWindowMock.mockReset()
    notificationSettingsMocks.getNotificationScanSettingsMock.mockClear()
    notificationSettingsMocks.getNotificationChannelAvailabilityMock.mockClear()
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockResolvedValue([subscription])
    notificationState.listReminderScanSubscriptionsCustomWindowMock.mockResolvedValue([])
    notificationSettingsMocks.getNotificationChannelAvailabilityMock.mockResolvedValue({
      hasEnabledChannel: true,
      primaryWebhookEnabled: true,
      emailNotificationsEnabled: false,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })
    notificationState.defaultAdvanceReminderRules = '3&09:30;0&09:30;'
    notificationState.defaultOverdueReminderRules = '1&09:30;2&09:30;3&09:30;'
    notificationState.mergeMultiSubscriptionNotifications = false
    notificationState.timezone = 'Asia/Shanghai'
  })

  it('does not dispatch before the configured reminder time', async () => {
    await scanRenewalNotifications(new Date('2026-05-01T09:29:00+08:00'))

    expect(notificationState.dispatchMock).not.toHaveBeenCalled()
  })

  it('dispatches at the configured reminder minute', async () => {
    await scanRenewalNotifications(new Date('2026-05-01T09:30:00+08:00'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
    expect(notificationState.dispatchMock.mock.calls[0][0]).toMatchObject({
      periodKey: '2026-05-04:upcoming:advance-3@09:30'
    })
  })

  it('dispatches later on the same reminder day if the exact minute was missed', async () => {
    await scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
    expect(notificationState.dispatchMock.mock.calls[0][0]).toMatchObject({
      periodKey: '2026-05-04:upcoming:advance-3@09:30'
    })
  })

  it('does not dispatch the previous reminder day on the next day', async () => {
    await scanRenewalNotifications(new Date('2026-05-02T10:15:00+08:00'))

    expect(notificationState.dispatchMock).not.toHaveBeenCalled()
  })

  it('dispatches a one-day advance reminder for a subscription expiring tomorrow', async () => {
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockResolvedValue([
      {
        ...subscription,
        nextRenewalDate: new Date('2026-05-02T00:00:00+08:00'),
        notifyDaysBefore: 1,
        advanceReminderRules: '1&09:30;'
      }
    ])

    await scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
    expect(notificationState.dispatchMock.mock.calls[0][0]).toMatchObject({
      eventType: 'subscription.reminder_due',
      periodKey: '2026-05-02:upcoming:advance-1@09:30',
      payload: expect.objectContaining({
        daysUntilRenewal: 1,
        reminderRuleDays: 1,
        reminderRuleTime: '09:30'
      })
    })
  })

  it('dispatches a tomorrow reminder when the subscription inherits a one-day default rule', async () => {
    notificationState.defaultAdvanceReminderRules = '3&09:30;1&17:14;0&09:30;'
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockResolvedValue([
      {
        ...subscription,
        nextRenewalDate: new Date('2026-05-02T00:00:00+08:00'),
        notifyDaysBefore: 3,
        advanceReminderRules: ''
      }
    ])

    await scanRenewalNotifications(new Date('2026-05-01T17:15:00+08:00'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
    expect(notificationState.dispatchMock.mock.calls[0][0]).toMatchObject({
      eventType: 'subscription.reminder_due',
      periodKey: '2026-05-02:upcoming:advance-1@17:14',
      payload: expect.objectContaining({
        daysUntilRenewal: 1,
        reminderRuleDays: 1,
        reminderRuleTime: '17:14'
      })
    })
  })

  it('queries enough future subscriptions for per-subscription rules beyond the global default window', async () => {
    notificationState.defaultAdvanceReminderRules = '0&09:30;'
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockResolvedValue([])
    notificationState.listReminderScanSubscriptionsCustomWindowMock.mockResolvedValue([
      {
        ...subscription,
        nextRenewalDate: new Date('2026-05-02T00:00:00+08:00'),
        notifyDaysBefore: 1,
        advanceReminderRules: '1&09:30;'
      }
    ])

    await scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'))

    expect(notificationState.listReminderScanSubscriptionsDefaultWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryStart: expect.any(Date),
        queryEnd: expect.any(Date)
      })
    )
    expect(notificationState.listReminderScanSubscriptionsCustomWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryStart: expect.any(Date),
        queryEnd: expect.any(Date)
      })
    )
    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
  })

  it('skips scheduled scan entirely when no notification channel is enabled', async () => {
    notificationSettingsMocks.getNotificationChannelAvailabilityMock.mockResolvedValue({
      hasEnabledChannel: false,
      primaryWebhookEnabled: false,
      emailNotificationsEnabled: false,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })

    const result = await scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'))

    expect(notificationSettingsMocks.getNotificationScanSettingsMock).not.toHaveBeenCalled()
    expect(notificationState.listReminderScanSubscriptionsDefaultWindowMock).not.toHaveBeenCalled()
    expect(notificationState.listReminderScanSubscriptionsCustomWindowMock).not.toHaveBeenCalled()
    expect(notificationState.dispatchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      processedCount: 0,
      matchedReminderCount: 0,
      notificationCount: 0,
      candidates: [],
      notifications: []
    })
  })

  it('still scans in debug mode even when no notification channel is enabled', async () => {
    notificationSettingsMocks.getNotificationChannelAvailabilityMock.mockResolvedValue({
      hasEnabledChannel: false,
      primaryWebhookEnabled: false,
      emailNotificationsEnabled: false,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })

    await scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'), {
      dryRun: true,
      forceScanWithoutChannels: true,
      includeDebugCandidates: true
    })

    expect(notificationState.listReminderScanSubscriptionsDefaultWindowMock).toHaveBeenCalled()
  })

  it('deduplicates overlapping default-window and custom-window candidates by subscription id', async () => {
    notificationState.defaultAdvanceReminderRules = '1&09:30;0&09:30;'
    notificationState.listReminderScanSubscriptionsDefaultWindowMock.mockResolvedValue([
      {
        ...subscription,
        id: 'sub-overlap',
        nextRenewalDate: new Date('2026-05-02T00:00:00+08:00'),
        advanceReminderRules: '1&09:30;'
      }
    ])
    notificationState.listReminderScanSubscriptionsCustomWindowMock.mockResolvedValue([
      {
        ...subscription,
        id: 'sub-overlap',
        nextRenewalDate: new Date('2026-05-02T00:00:00+08:00'),
        advanceReminderRules: '1&09:30;'
      }
    ])

    await scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
  })
})
