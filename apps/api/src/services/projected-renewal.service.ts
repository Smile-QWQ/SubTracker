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
  amount: number
  currency: string
  status: SubscriptionStatus
  subscription: T
}

const DEFAULT_MAX_OCCURRENCES_PER_SUBSCRIPTION = 480

export function projectRenewalEvents<T extends ProjectableSubscription>(
  subscriptions: T[],
  options: {
    start: Date | string
    end: Date | string
    statuses?: SubscriptionStatus[]
    maxOccurrencesPerSubscription?: number
    timezone?: string
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
        amount: subscription.amount,
        currency: subscription.currency,
        status: subscription.status,
        subscription
      })

      cursor = toTimezonedDayjs(
        addInterval(cursor.toDate(), subscription.billingIntervalCount, subscription.billingIntervalUnit, timezone),
        timezone
      ).startOf('day')
      guard += 1
    }
  }

  return events.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime()
    if (dateDiff !== 0) return dateDiff
    return a.title.localeCompare(b.title, 'zh-CN')
  })
}
