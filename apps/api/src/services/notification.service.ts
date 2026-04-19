import dayjs from 'dayjs'
import { prisma } from '../db'
import { toIsoDate } from '../utils/date'
import { dispatchNotificationEvent } from './channel-notification.service'
import { getAppSettings } from './settings.service'

export type ReminderPhase = 'upcoming' | 'due_today' | 'overdue_day_1' | 'overdue_day_2' | 'overdue_day_3'

type ReminderRuleSettings = {
  notifyOnDueDay: boolean
  overdueReminderDays: Array<1 | 2 | 3>
}

export function resolveReminderPhase(
  today: Date,
  nextRenewalDate: Date,
  notifyDaysBefore: number,
  settings: ReminderRuleSettings = {
    notifyOnDueDay: true,
    overdueReminderDays: [1, 2, 3]
  }
): { eventType: 'subscription.reminder_due' | 'subscription.overdue'; phase: ReminderPhase } | null {
  const todayStart = dayjs(today).startOf('day')
  const renewalStart = dayjs(nextRenewalDate).startOf('day')
  const diffDays = todayStart.diff(renewalStart, 'day')

  if (diffDays === 0 && settings.notifyOnDueDay) {
    return {
      eventType: 'subscription.reminder_due',
      phase: 'due_today'
    }
  }

  if (notifyDaysBefore > 0 && diffDays === -Math.max(notifyDaysBefore, 0)) {
    return {
      eventType: 'subscription.reminder_due',
      phase: 'upcoming'
    }
  }

  if (diffDays >= 1 && diffDays <= 3 && settings.overdueReminderDays.includes(diffDays as 1 | 2 | 3)) {
    return {
      eventType: 'subscription.overdue',
      phase: `overdue_day_${diffDays}` as ReminderPhase
    }
  }

  return null
}

export async function scanRenewalNotifications(today = new Date()) {
  const appSettings = await getAppSettings()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['active', 'expired'] },
      webhookEnabled: true
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    }
  })

  const currentDay = dayjs(today).startOf('day').toDate()

  for (const sub of subscriptions) {
    const daysOverdue = Math.max(dayjs(currentDay).diff(dayjs(sub.nextRenewalDate).startOf('day'), 'day'), 0)
    if (daysOverdue >= 1 && sub.status !== 'expired') {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' }
      })
    }

    const resolved = resolveReminderPhase(currentDay, sub.nextRenewalDate, sub.notifyDaysBefore, {
      notifyOnDueDay: appSettings.notifyOnDueDay,
      overdueReminderDays: appSettings.overdueReminderDays
    })
    if (!resolved) continue

    const resourceKey = `subscription:${sub.id}`
    const periodKey = `${toIsoDate(sub.nextRenewalDate)}:${resolved.phase}`
    const daysUntilRenewal = Math.max(dayjs(sub.nextRenewalDate).startOf('day').diff(dayjs(currentDay), 'day'), 0)

    await dispatchNotificationEvent({
      eventType: resolved.eventType,
      resourceKey,
      periodKey,
      subscriptionId: sub.id,
      payload: {
        id: sub.id,
        name: sub.name,
        nextRenewalDate: sub.nextRenewalDate.toISOString(),
        notifyDaysBefore: sub.notifyDaysBefore,
        amount: sub.amount,
        currency: sub.currency,
        status: daysOverdue > 0 ? 'expired' : sub.status,
        tagNames: sub.tags.map((item) => item.tag.name),
        websiteUrl: sub.websiteUrl ?? '',
        notes: sub.notes ?? '',
        phase: resolved.phase === 'upcoming' ? 'upcoming' : resolved.phase === 'due_today' ? 'due_today' : 'overdue',
        daysUntilRenewal,
        daysOverdue
      }
    })
  }
}
