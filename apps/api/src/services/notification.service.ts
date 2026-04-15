import dayjs from 'dayjs'
import { prisma } from '../db'
import { isOverdue, isReminderDue, toIsoDate } from '../utils/date'
import { getLatestSnapshot } from './exchange-rate.service'
import { dispatchNotificationEvent } from './channel-notification.service'

export async function scanRenewalNotifications() {
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

  const today = dayjs().startOf('day').toDate()

  for (const sub of subscriptions) {
    const periodKey = toIsoDate(sub.nextRenewalDate)
    const resourceKey = `subscription:${sub.id}`

    if (isOverdue(today, sub.nextRenewalDate)) {
      await dispatchNotificationEvent({
        eventType: 'subscription.overdue',
        resourceKey,
        periodKey,
        subscriptionId: sub.id,
        payload: {
          id: sub.id,
          name: sub.name,
          nextRenewalDate: sub.nextRenewalDate.toISOString(),
          amount: sub.amount,
          currency: sub.currency,
          status: sub.status
        }
      })

      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' }
      })

      continue
    }

    if (isReminderDue(today, sub.nextRenewalDate, sub.notifyDaysBefore)) {
      await dispatchNotificationEvent({
        eventType: 'subscription.reminder_due',
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
          tagNames: sub.tags.map((item) => item.tag.name)
        }
      })
    }
  }
}

export async function notifyIfExchangeRateStale() {
  const snapshot = await getLatestSnapshot()
  if (!snapshot.isStale) return

  await dispatchNotificationEvent({
    eventType: 'exchange-rate.stale',
    resourceKey: `exchange-rate:${snapshot.baseCurrency}`,
    periodKey: dayjs().format('YYYY-MM-DD'),
    payload: {
      baseCurrency: snapshot.baseCurrency,
      fetchedAt: snapshot.fetchedAt,
      provider: snapshot.provider,
      isStale: snapshot.isStale
    }
  })
}
