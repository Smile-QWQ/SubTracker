import { describe, expect, it } from 'vitest'
import { getMessage } from '@subtracker/shared'
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
      phaseLabel: getMessage('zh-CN', 'notifications.phases.dueToday')
    })
    expect(buildNotificationMessage(params)).toMatchObject({
      title: getMessage('zh-CN', 'notifications.titles.single', {
        phase: getMessage('zh-CN', 'notifications.phases.dueToday'),
        name: 'Netflix'
      })
    })
    expect(buildNotificationMessage(params).text).toContain(getMessage('zh-CN', 'notifications.presentation.subscriptionName', { name: 'Netflix' }))
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
            title: getMessage('zh-CN', 'notifications.merge.phaseDueToday'),
            eventType: 'subscription.reminder_due',
            subscriptions: [netflixPayload]
          },
          {
            phase: 'overdue_day_1',
            title: getMessage('zh-CN', 'notifications.merge.phaseOverdueDay', { days: 1 }),
            eventType: 'subscription.overdue',
            subscriptions: [spotifyPayload]
          }
        ],
        name: getMessage('zh-CN', 'notifications.merge.summaryName', { count: 2 }),
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
      phaseLabel: getMessage('zh-CN', 'notifications.phases.summary')
    })
    expect(message.title).toBe(
      getMessage('zh-CN', 'notifications.presentation.mergedTitle', {
        prefix: getMessage('zh-CN', 'notifications.phases.summary'),
        count: 2
      })
    )
    expect(message.text).toContain(
      getMessage('zh-CN', 'notifications.presentation.sectionTitle', {
        title: getMessage('zh-CN', 'notifications.merge.phaseDueToday'),
        count: 1
      })
    )
    expect(message.text).toContain(
      getMessage('zh-CN', 'notifications.presentation.sectionTitle', {
        title: getMessage('zh-CN', 'notifications.merge.phaseOverdueDay', { days: 1 }),
        count: 1
      })
    )
  })
})
