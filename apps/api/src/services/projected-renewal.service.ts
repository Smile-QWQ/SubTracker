import dayjs from 'dayjs'
import type { BillingIntervalUnit, SubscriptionStatus } from '@subtracker/shared'
import { addInterval } from '../utils/date'
import { DEFAULT_APP_TIMEZONE, formatDateInTimezone, toTimezonedDayjs } from '../utils/timezone'

type ProjectableSubscription = {
  id: string
  name: string
  amount: number
  currency: string
  status: SubscriptionStatus
  billingIntervalCount: number
  billingIntervalUnit: BillingIntervalUnit
  nextRenewalDate: Date
}

export interface ProjectedRenewalEvent<T extends ProjectableSubscription = ProjectableSubscription> {
  id: string
  subscriptionId: string
  title: string
  date: Date
  dateKey: string
  amount: number
  currency: string
  status: SubscriptionStatus
}

const DEFAULT_MAX_OCCURRENCES_PER_SUBSCRIPTION = 480

function fastForwardFixedIntervalCursor<T extends ProjectableSubscription>(
  cursor: dayjs.Dayjs,
  rangeStart: dayjs.Dayjs,
  subscription: T,
  remainingOccurrences: number
) {
  if (remainingOccurrences <= 0) {
    return { cursor, consumed: 0 }
  }

  const intervalCount = Math.max(subscription.billingIntervalCount, 1)

  if (subscription.billingIntervalUnit === 'day') {
    const diffDays = rangeStart.diff(cursor, 'day')
    if (diffDays > intervalCount) {
      const steps = Math.min(Math.floor(diffDays / intervalCount), remainingOccurrences)
      if (steps > 0) {
        return {
          cursor: cursor.add(steps * intervalCount, 'day').startOf('day'),
          consumed: steps
        }
      }
    }
  }

  if (subscription.billingIntervalUnit === 'week') {
    const diffDays = rangeStart.diff(cursor, 'day')
    const intervalDays = intervalCount * 7
    if (diffDays > intervalDays) {
      const steps = Math.min(Math.floor(diffDays / intervalDays), remainingOccurrences)
      if (steps > 0) {
        return {
          cursor: cursor.add(steps * intervalCount, 'week').startOf('day'),
          consumed: steps
        }
      }
    }
  }

  return { cursor, consumed: 0 }
}

export function projectRenewalEvents<T extends ProjectableSubscription>(
  subscriptions: T[],
  options: {
    start: Date | string
    end: Date | string
    timezone?: string
    statuses?: SubscriptionStatus[]
    maxOccurrencesPerSubscription?: number
    sortResult?: boolean
  }
) {
  const timezone = options.timezone ?? DEFAULT_APP_TIMEZONE
  const rangeStart = toTimezonedDayjs(options.start, timezone).startOf('day')
  const rangeEnd = toTimezonedDayjs(options.end, timezone).endOf('day')

  if (rangeStart.isAfter(rangeEnd)) {
    return [] as ProjectedRenewalEvent<T>[]
  }

  const allowedStatuses = new Set<SubscriptionStatus>(options.statuses ?? ['active', 'expired'])
  const maxOccurrencesPerSubscription = options.maxOccurrencesPerSubscription ?? DEFAULT_MAX_OCCURRENCES_PER_SUBSCRIPTION
  const events: ProjectedRenewalEvent<T>[] = []

  for (const subscription of subscriptions) {
    if (!allowedStatuses.has(subscription.status)) {
      continue
    }

    let cursor = toTimezonedDayjs(subscription.nextRenewalDate, timezone).startOf('day')
    let guard = 0

    const fastForwarded = fastForwardFixedIntervalCursor(cursor, rangeStart, subscription, maxOccurrencesPerSubscription)
    cursor = fastForwarded.cursor
    guard += fastForwarded.consumed

    while (cursor.isBefore(rangeStart) && guard < maxOccurrencesPerSubscription) {
      cursor = toTimezonedDayjs(
        addInterval(cursor.toDate(), subscription.billingIntervalCount, subscription.billingIntervalUnit, timezone),
        timezone
      ).startOf('day')
      guard += 1
    }

    while (!cursor.isAfter(rangeEnd) && guard < maxOccurrencesPerSubscription) {
      const eventDate = formatDateInTimezone(cursor.toDate(), timezone)
      events.push({
        id: `${subscription.id}:${eventDate}`,
        subscriptionId: subscription.id,
        title: subscription.name,
        date: cursor.toDate(),
        dateKey: eventDate,
        amount: subscription.amount,
        currency: subscription.currency,
        status: subscription.status
      })

      cursor = toTimezonedDayjs(
        addInterval(cursor.toDate(), subscription.billingIntervalCount, subscription.billingIntervalUnit, timezone),
        timezone
      ).startOf('day')
      guard += 1
    }
  }

  if (options.sortResult === false) {
    return events
  }

  return events.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime()
    if (dateDiff !== 0) return dateDiff
    return a.title.localeCompare(b.title, 'zh-CN')
  })
}
