import { describe, expect, it } from 'vitest'
import {
  buildNotificationMessage,
  resolveNotificationPresentation
} from '../../src/services/notification-presentation.service'
import { type NotificationDispatchParams } from '../../src/services/notification-merge.service'

const netflixPayload = {
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
  phase: 'due_today' as const,
  daysUntilRenewal: 0,
  daysOverdue: 0,
  reminderRuleTime: '09:30',
  reminderRuleDays: 0
}

const spotifyPayload = {
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
  phase: 'overdue' as const,
  daysUntilRenewal: 0,
  daysOverdue: 1,
  reminderRuleTime: '09:30',
  reminderRuleDays: 1
}

describe('notification presentation', () => {
  it('keeps single reminder title and body stable', () => {
    const params: NotificationDispatchParams = {
      eventType: 'subscription.reminder_due',
      resourceKey: 'subscription:sub-1',
      periodKey: '2026-05-01:due_today:advance-0@09:30',
      subscriptionId: 'sub-1',
      payload: {
        ...netflixPayload
      }
    }

    expect(resolveNotificationPresentation(params)).toMatchObject({
      mode: 'single',
      phaseLabel: '今天到期'
    })
    expect(buildNotificationMessage(params)).toMatchObject({
      title: '今天到期：Netflix'
    })
    expect(buildNotificationMessage(params).text).toContain('订阅名称：Netflix')
  })

  it('keeps merged reminder title and body stable', () => {
    const params: NotificationDispatchParams = {
      eventType: 'subscription.overdue',
      resourceKey: 'subscriptions:scan-summary',
      periodKey:
        '2026-05-01:summary:2026-04-30:overdue_day_1:overdue-1@09:30|2026-05-01:due_today:advance-0@09:30',
      payload: {
        merged: true,
        mergedCount: 2,
        subscriptions: [netflixPayload, spotifyPayload],
        mergedSections: [
          {
            phase: 'due_today',
            title: '今天到期',
            eventType: 'subscription.reminder_due',
            subscriptions: [netflixPayload]
          },
          {
            phase: 'overdue_day_1',
            title: '已过期第 1 天',
            eventType: 'subscription.overdue',
            subscriptions: [spotifyPayload]
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
        reminderRuleDays: 0
      }
    }

    const message = buildNotificationMessage(params)
    expect(resolveNotificationPresentation(params)).toMatchObject({
      mode: 'merged',
      phaseLabel: '订阅提醒汇总'
    })
    expect(message.title).toBe('订阅提醒汇总：共 2 项订阅')
    expect(message.text).toContain('今天到期（1 项）')
    expect(message.text).toContain('已过期第 1 天（1 项）')
  })
})
