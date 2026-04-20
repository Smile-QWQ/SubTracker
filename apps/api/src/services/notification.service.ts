import dayjs from 'dayjs'
import { prisma } from '../db'
import { toIsoDate } from '../utils/date'
import { dispatchNotificationEvent, type NotificationChannelResult } from './channel-notification.service'
import { getAppSettings } from './settings.service'

export type ReminderPhase = 'upcoming' | 'due_today' | 'overdue_day_1' | 'overdue_day_2' | 'overdue_day_3'

export type NotificationScanResult = {
  processedCount: number
  notificationCount: number
  notifications: Array<{
    subscriptionId: string
    subscriptionName: string
    phase: ReminderPhase
    eventType: 'subscription.reminder_due' | 'subscription.overdue'
    daysUntilRenewal: number
    daysOverdue: number
    channelResults: NotificationChannelResult[]
  }>
}

type ReminderRuleSettings = {
  notifyOnDueDay: boolean
  overdueReminderDays: Array<1 | 2 | 3>
}

type ReminderSubscriptionLike = {
  id: string
  name: string
  nextRenewalDate: Date
  notifyDaysBefore: number
  amount: number
  currency: string
  status: string
  websiteUrl: string | null
  notes: string
  tags: Array<{
    tag: {
      name: string
    }
  }>
}

type ReminderEntryPayload = {
  id: string
  name: string
  nextRenewalDate: string
  notifyDaysBefore: number
  amount: number
  currency: string
  status: string
  tagNames: string[]
  websiteUrl: string
  notes: string
  phase: 'upcoming' | 'due_today' | 'overdue'
  daysUntilRenewal: number
  daysOverdue: number
}

type ReminderDispatchEntry = {
  eventType: 'subscription.reminder_due' | 'subscription.overdue'
  phase: ReminderPhase
  resourceKey: string
  periodKey: string
  subscriptionId: string
  payload: ReminderEntryPayload
}

type ReminderSummarySection = {
  phase: ReminderPhase
  title: string
  eventType: 'subscription.reminder_due' | 'subscription.overdue'
  subscriptions: ReminderEntryPayload[]
}

function getSummaryPhaseTitle(phase: ReminderPhase) {
  switch (phase) {
    case 'upcoming':
      return '即将到期'
    case 'due_today':
      return '今天到期'
    case 'overdue_day_1':
      return '已过期第 1 天'
    case 'overdue_day_2':
      return '已过期第 2 天'
    case 'overdue_day_3':
      return '已过期第 3 天'
    default:
      return phase
  }
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

function buildDispatchEntry(
  sub: ReminderSubscriptionLike,
  currentDay: Date,
  resolved: NonNullable<ReturnType<typeof resolveReminderPhase>>
): ReminderDispatchEntry {
  const daysOverdue = Math.max(dayjs(currentDay).diff(dayjs(sub.nextRenewalDate).startOf('day'), 'day'), 0)
  const daysUntilRenewal = Math.max(dayjs(sub.nextRenewalDate).startOf('day').diff(dayjs(currentDay), 'day'), 0)

  return {
    eventType: resolved.eventType,
    phase: resolved.phase,
    resourceKey: `subscription:${sub.id}`,
    periodKey: `${toIsoDate(sub.nextRenewalDate)}:${resolved.phase}`,
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
  }
}

function buildMergedSummarySections(entries: ReminderDispatchEntry[]): ReminderSummarySection[] {
  const groups = new Map<ReminderPhase, ReminderSummarySection>()

  for (const entry of entries) {
    const existing = groups.get(entry.phase)
    if (existing) {
      existing.subscriptions.push(entry.payload)
      continue
    }

    groups.set(entry.phase, {
      phase: entry.phase,
      title: getSummaryPhaseTitle(entry.phase),
      eventType: entry.eventType,
      subscriptions: [entry.payload]
    })
  }

  return Array.from(groups.values()).sort((a, b) => {
    const order: ReminderPhase[] = ['upcoming', 'due_today', 'overdue_day_1', 'overdue_day_2', 'overdue_day_3']
    return order.indexOf(a.phase) - order.indexOf(b.phase)
  })
}

function buildMergedPayload(entries: ReminderDispatchEntry[]) {
  const sections = buildMergedSummarySections(entries)
  const flattenedSubscriptions = sections.flatMap((section) => section.subscriptions)
  const hasOverdue = sections.some((section) => section.eventType === 'subscription.overdue')

  return {
    merged: true,
    mergedCount: flattenedSubscriptions.length,
    mergedSections: sections,
    name: `共 ${flattenedSubscriptions.length} 项订阅`,
    nextRenewalDate: flattenedSubscriptions[0]?.nextRenewalDate ?? new Date().toISOString(),
    notifyDaysBefore: 0,
    amount: flattenedSubscriptions.reduce((sum, item) => sum + item.amount, 0),
    currency: flattenedSubscriptions[0]?.currency ?? 'CNY',
    status: hasOverdue ? 'expired' : flattenedSubscriptions[0]?.status ?? 'active',
    tagNames: [],
    websiteUrl: '',
    notes: '',
    phase: 'summary',
    daysUntilRenewal: Math.min(...flattenedSubscriptions.map((item) => item.daysUntilRenewal)),
    daysOverdue: Math.max(...flattenedSubscriptions.map((item) => item.daysOverdue)),
    subscriptions: flattenedSubscriptions
  }
}

export async function scanRenewalNotifications(today = new Date()): Promise<NotificationScanResult> {
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
  const dispatchEntries: ReminderDispatchEntry[] = []
  const notifications: NotificationScanResult['notifications'] = []

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

    dispatchEntries.push(buildDispatchEntry(sub, currentDay, resolved))
  }

  if (!appSettings.mergeMultiSubscriptionNotifications || dispatchEntries.length <= 1) {
    for (const entry of dispatchEntries) {
      const channelResults = await dispatchNotificationEvent({
        eventType: entry.eventType,
        resourceKey: entry.resourceKey,
        periodKey: entry.periodKey,
        subscriptionId: entry.subscriptionId,
        payload: entry.payload
      })

      notifications.push({
        subscriptionId: entry.subscriptionId,
        subscriptionName: entry.payload.name,
        phase: entry.phase,
        eventType: entry.eventType,
        daysUntilRenewal: entry.payload.daysUntilRenewal,
        daysOverdue: entry.payload.daysOverdue,
        channelResults
      })
    }

    return {
      processedCount: subscriptions.length,
      notificationCount: notifications.length,
      notifications
    }
  }

  const mergedPayload = buildMergedPayload(dispatchEntries)
  const mergedEventType = dispatchEntries.some((entry) => entry.eventType === 'subscription.overdue')
    ? 'subscription.overdue'
    : 'subscription.reminder_due'
  const channelResults = await dispatchNotificationEvent({
    eventType: mergedEventType,
    resourceKey: 'subscriptions:scan-summary',
    periodKey: `${toIsoDate(currentDay)}:summary`,
    payload: mergedPayload
  })

  notifications.push({
    subscriptionId: 'merged:summary',
    subscriptionName: `共 ${dispatchEntries.length} 项订阅`,
    phase: dispatchEntries[0].phase,
    eventType: mergedEventType,
    daysUntilRenewal: Math.min(...dispatchEntries.map((entry) => entry.payload.daysUntilRenewal)),
    daysOverdue: Math.max(...dispatchEntries.map((entry) => entry.payload.daysOverdue)),
    channelResults
  })

  return {
    processedCount: subscriptions.length,
    notificationCount: notifications.length,
    notifications
  }
}
