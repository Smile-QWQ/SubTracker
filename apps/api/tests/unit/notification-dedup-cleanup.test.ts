import { beforeEach, describe, expect, it, vi } from 'vitest'

const cleanupState = vi.hoisted(() => ({
  settingDeleteManyMock: vi.fn(),
  notificationDeliveryDeleteManyMock: vi.fn(),
  getAppTimezoneMock: vi.fn(),
  runDailyTaskAtLocalHourMock: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: {
    setting: {
      deleteMany: cleanupState.settingDeleteManyMock
    },
    notificationDelivery: {
      deleteMany: cleanupState.notificationDeliveryDeleteManyMock
    }
  }
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppTimezone: cleanupState.getAppTimezoneMock
}))

vi.mock('../../src/services/worker-cron.service', () => ({
  runDailyTaskAtLocalHour: cleanupState.runDailyTaskAtLocalHourMock
}))

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn()
  }
}))

import {
  cleanupLegacyNotificationDedupSettings,
  cleanupNotificationDeliveryClaims,
  NOTIFICATION_DEDUP_RETENTION_DAYS
} from '../../src/services/channel-notification.service'
import {
  cleanupNotificationDedupSettingsOncePerDay,
  cleanupNotificationDedupStateOncePerDay
} from '../../src/services/scheduler.service'

describe('notification dedup cleanup', () => {
  beforeEach(() => {
    cleanupState.settingDeleteManyMock.mockReset()
    cleanupState.notificationDeliveryDeleteManyMock.mockReset()
    cleanupState.getAppTimezoneMock.mockReset()
    cleanupState.runDailyTaskAtLocalHourMock.mockReset()
    cleanupState.settingDeleteManyMock.mockResolvedValue({ count: 2 })
    cleanupState.notificationDeliveryDeleteManyMock.mockResolvedValue({ count: 3 })
    cleanupState.getAppTimezoneMock.mockResolvedValue('Asia/Shanghai')
    cleanupState.runDailyTaskAtLocalHourMock.mockImplementation(async (_key, _timezone, _hour, _now, task) => {
      await task()
      return true
    })
  })

  it('uses a 30-day default retention window for legacy notification dedup settings', async () => {
    const now = new Date('2026-05-01T12:00:00.000Z')
    const deleted = await cleanupLegacyNotificationDedupSettings(now)

    expect(NOTIFICATION_DEDUP_RETENTION_DAYS).toBe(30)
    expect(deleted).toBe(2)
    expect(cleanupState.settingDeleteManyMock).toHaveBeenCalledWith({
      where: {
        key: {
          startsWith: 'notification:'
        },
        updatedAt: {
          lt: new Date('2026-04-01T12:00:00.000Z')
        }
      }
    })
  })

  it('allows callers to override the retention window', async () => {
    const now = new Date('2026-05-01T12:00:00.000Z')
    await cleanupLegacyNotificationDedupSettings(now, 90)

    expect(cleanupState.settingDeleteManyMock).toHaveBeenCalledWith({
      where: {
        key: {
          startsWith: 'notification:'
        },
        updatedAt: {
          lt: new Date('2026-01-31T12:00:00.000Z')
        }
      }
    })
  })

  it('uses the same retention window for notification-delivery claims', async () => {
    const now = new Date('2026-05-01T12:00:00.000Z')
    const deleted = await cleanupNotificationDeliveryClaims(now)

    expect(deleted).toBe(3)
    expect(cleanupState.notificationDeliveryDeleteManyMock).toHaveBeenCalledWith({
      where: {
        updatedAt: {
          lt: new Date('2026-04-01T12:00:00.000Z')
        }
      }
    })
  })

  it('runs both cleanup phases through a daily local-time gate', async () => {
    const now = new Date('2026-05-01T12:00:00.000Z')
    await cleanupNotificationDedupStateOncePerDay(now)

    expect(cleanupState.runDailyTaskAtLocalHourMock).toHaveBeenCalledWith(
      'cleanupNotificationDedupSettings',
      'Asia/Shanghai',
      3,
      now,
      expect.any(Function)
    )
    expect(cleanupState.settingDeleteManyMock).toHaveBeenCalledTimes(1)
    expect(cleanupState.notificationDeliveryDeleteManyMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the legacy scheduler export as an alias', async () => {
    expect(cleanupNotificationDedupSettingsOncePerDay).toBe(cleanupNotificationDedupStateOncePerDay)
  })
})
