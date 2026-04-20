import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationState = vi.hoisted(() => ({
  mergeMultiSubscriptionNotifications: true,
  dispatchMock: vi.fn(),
  updateMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    notifyOnDueDay: true,
    mergeMultiSubscriptionNotifications: notificationState.mergeMultiSubscriptionNotifications,
    overdueReminderDays: [1, 2, 3]
  }))
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  dispatchNotificationEvent: notificationState.dispatchMock
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(async () => [
        {
          id: 'sub-1',
          name: 'Netflix',
          nextRenewalDate: new Date('2026-04-23T00:00:00.000Z'),
          notifyDaysBefore: 3,
          amount: 9.9,
          currency: 'USD',
          status: 'active',
          websiteUrl: 'https://netflix.com',
          notes: 'stream',
          tags: [{ tag: { name: '视频' } }]
        },
        {
          id: 'sub-2',
          name: 'Spotify',
          nextRenewalDate: new Date('2026-04-22T00:00:00.000Z'),
          notifyDaysBefore: 5,
          amount: 12.9,
          currency: 'USD',
          status: 'active',
          websiteUrl: 'https://spotify.com',
          notes: 'music',
          tags: [{ tag: { name: '音乐' } }]
        }
      ]),
      update: notificationState.updateMock
    }
  }
}))

import { scanRenewalNotifications } from '../../src/services/notification.service'

describe('scanRenewalNotifications merge behavior', () => {
  beforeEach(() => {
    notificationState.dispatchMock.mockReset()
    notificationState.updateMock.mockReset()
  })

  it('merges all reminders from the same scan into a single summary notification by default', async () => {
    notificationState.mergeMultiSubscriptionNotifications = true

    await scanRenewalNotifications(new Date('2026-04-23T10:00:00.000Z'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(1)
    const payload = notificationState.dispatchMock.mock.calls[0][0].payload
    expect(payload.merged).toBe(true)
    expect(payload.mergedCount).toBe(2)
    expect(payload.subscriptions).toHaveLength(2)
    expect(payload.mergedSections).toHaveLength(2)
    expect(payload.mergedSections.map((section: { title: string }) => section.title)).toEqual(['今天到期', '已过期第 1 天'])
  })

  it('sends notifications separately when merging is disabled', async () => {
    notificationState.mergeMultiSubscriptionNotifications = false

    await scanRenewalNotifications(new Date('2026-04-23T10:00:00.000Z'))

    expect(notificationState.dispatchMock).toHaveBeenCalledTimes(2)
    for (const call of notificationState.dispatchMock.mock.calls) {
      expect(call[0].payload.merged).not.toBe(true)
    }
  })
})
