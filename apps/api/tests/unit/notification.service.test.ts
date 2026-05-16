import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationServiceMocks = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  dispatchNotificationEventMock: vi.fn(),
  getNotificationScanSettingsMock: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany: notificationServiceMocks.findManyMock
    }
  }
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  dispatchNotificationEvent: notificationServiceMocks.dispatchNotificationEventMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getNotificationScanSettings: notificationServiceMocks.getNotificationScanSettingsMock
}))

import { scanRenewalNotifications } from '../../src/services/notification.service'

function createSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    name: 'Netflix',
    nextRenewalDate: new Date('2026-05-04T00:00:00.000Z'),
    notifyDaysBefore: 3,
    advanceReminderRules: '3&09:30;',
    overdueReminderRules: '1&09:30;',
    amount: 10,
    currency: 'USD',
    status: 'active',
    websiteUrl: 'https://example.com',
    notes: '',
    webhookEnabled: true,
    tags: [{ tag: { name: '影音' } }],
    ...overrides
  }
}

describe('notification service', () => {
  beforeEach(() => {
    notificationServiceMocks.findManyMock.mockReset()
    notificationServiceMocks.dispatchNotificationEventMock.mockReset()
    notificationServiceMocks.getNotificationScanSettingsMock.mockReset()

    notificationServiceMocks.getNotificationScanSettingsMock.mockResolvedValue({
      timezone: 'Asia/Shanghai',
      defaultAdvanceReminderRules: '3&09:30;0&09:30;',
      defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
      mergeMultiSubscriptionNotifications: false
    })
    notificationServiceMocks.findManyMock.mockResolvedValue([createSubscription()])
    notificationServiceMocks.dispatchNotificationEventMock.mockResolvedValue([
      { channel: 'email', status: 'success', message: 'ok' }
    ])
  })

  it('omits debug candidates by default', async () => {
    const result = await scanRenewalNotifications(new Date('2026-05-01T09:30:00.000+08:00'))

    expect(result.candidates).toEqual([])
  })

  it('returns debug candidates when explicitly requested', async () => {
    const result = await scanRenewalNotifications(new Date('2026-05-01T09:30:00.000+08:00'), {
      includeDebugCandidates: true
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      subscriptionId: 'sub_1',
      subscriptionName: 'Netflix'
    })
  })
})
