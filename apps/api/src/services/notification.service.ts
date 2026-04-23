import dayjs from 'dayjs'
import { prisma } from '../db'
import { toIsoDate } from '../utils/date'
import { dispatchNotificationEvent, type NotificationChannelResult } from './channel-notification.service'
import {
  buildAdvanceReminderRulesFromLegacyWithDefault,
  parseReminderRules,
  type ReminderRule
} from './reminder-rules.service'
import { getNotificationScanSettings } from './settings.service'

export type ReminderPhase = 'upcoming' | 'due_today' | `overdue_day_${number}`

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

export type NotificationScanOverrides = Partial<
  Awaited<ReturnType<typeof getNotificationScanSettings>>
>

type ReminderSubscriptionLike = {
  id: string
  name: string
  nextRenewalDate: Date
  notifyDaysBefore: number
  advanceReminderRules: string | null
  overdueReminderRules: string | null
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
  phase: 'upcoming' | 'due_today' | 'overdue' | 'summary'
  daysUntilRenewal: number
  daysOverdue: number
  reminderRuleTime: string
  reminderRuleDays: number
}

type ReminderDispatchEntry = {
  eventType: 'subscription.reminder_due' | 'subscription.overdue'
  phase: ReminderPhase
  title: string
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

type ReminderMatch = {
  eventType: 'subscription.reminder_due' | 'subscription.overdue'
  phase: ReminderPhase
  title: string
  daysUntilRenewal: number
  daysOverdue: number
  ruleTime: string
  ruleKey: string
}

function getOverduePhase(daysOverdue: number): ReminderPhase {
  return `overdue_day_${daysOverdue}`
}

function buildReminderTitle(eventType: 'subscription.reminder_due' | 'subscription.overdue', days: number) {
  if (eventType === 'subscription.reminder_due') {
    return days === 0 ? '今天到期' : `还有 ${days} 天到期`
  }

  return `已过期第 ${days} 天`
}

function getSummaryPhaseTitle(phase: ReminderPhase) {
  if (phase === 'upcoming') return '即将到期'
  if (phase === 'due_today') return '今天到期'

  const overdueMatch = phase.match(/^overdue_day_(\d+)$/)
  if (overdueMatch) {
    return `已过期第 ${overdueMatch[1]} 天`
  }

  return phase
}

function resolveAdvanceRules(sub: ReminderSubscriptionLike, defaultAdvanceReminderRules: string) {
  if (sub.advanceReminderRules === '') {
    return parseReminderRules(defaultAdvanceReminderRules, 'advance')
  }

  if (sub.advanceReminderRules?.trim()) {
    return parseReminderRules(sub.advanceReminderRules, 'advance')
  }

  const legacyRules = buildAdvanceReminderRulesFromLegacyWithDefault(sub.notifyDaysBefore, defaultAdvanceReminderRules)
  return parseReminderRules(legacyRules || defaultAdvanceReminderRules, 'advance')
}

function resolveOverdueRules(sub: ReminderSubscriptionLike, defaultOverdueReminderRules: string) {
  if (sub.overdueReminderRules === '') {
    return parseReminderRules(defaultOverdueReminderRules, 'overdue')
  }

  if (sub.overdueReminderRules?.trim()) {
    return parseReminderRules(sub.overdueReminderRules, 'overdue')
  }

  return parseReminderRules(defaultOverdueReminderRules, 'overdue')
}

function resolveRuleTriggerMoment(nextRenewalDate: Date, rule: ReminderRule, direction: 'advance' | 'overdue') {
  const renewalDay = dayjs(nextRenewalDate).startOf('day')
  const base = direction === 'advance' ? renewalDay.subtract(rule.days, 'day') : renewalDay.add(rule.days, 'day')
  return base.hour(rule.hour).minute(rule.minute).second(0).millisecond(0)
}

function matchReminderRule(
  now: dayjs.Dayjs,
  nextRenewalDate: Date,
  rule: ReminderRule,
  direction: 'advance' | 'overdue'
): ReminderMatch | null {
  const trigger = resolveRuleTriggerMoment(nextRenewalDate, rule, direction)
  if (!now.isSame(trigger, 'minute')) {
    return null
  }

  if (direction === 'advance') {
    return {
      eventType: 'subscription.reminder_due',
      phase: rule.days === 0 ? 'due_today' : 'upcoming',
      title: buildReminderTitle('subscription.reminder_due', rule.days),
      daysUntilRenewal: rule.days,
      daysOverdue: 0,
      ruleTime: rule.time,
      ruleKey: `advance-${rule.days}@${rule.time}`
    }
  }

  return {
    eventType: 'subscription.overdue',
    phase: getOverduePhase(rule.days),
    title: buildReminderTitle('subscription.overdue', rule.days),
    daysUntilRenewal: 0,
    daysOverdue: rule.days,
    ruleTime: rule.time,
    ruleKey: `overdue-${rule.days}@${rule.time}`
  }
}

function resolveReminderMatches(
  now: dayjs.Dayjs,
  sub: ReminderSubscriptionLike,
  settings: Awaited<ReturnType<typeof getNotificationScanSettings>>
) {
  const matches: ReminderMatch[] = []

  for (const rule of resolveAdvanceRules(sub, settings.defaultAdvanceReminderRules)) {
    const match = matchReminderRule(now, sub.nextRenewalDate, rule, 'advance')
    if (match) {
      matches.push(match)
    }
  }

  for (const rule of resolveOverdueRules(sub, settings.defaultOverdueReminderRules)) {
    const match = matchReminderRule(now, sub.nextRenewalDate, rule, 'overdue')
    if (match) {
      matches.push(match)
    }
  }

  return matches
}

function buildDispatchEntry(sub: ReminderSubscriptionLike, resolved: ReminderMatch): ReminderDispatchEntry {
  return {
    eventType: resolved.eventType,
    phase: resolved.phase,
    title: resolved.title,
    resourceKey: `subscription:${sub.id}`,
    periodKey: `${toIsoDate(sub.nextRenewalDate)}:${resolved.phase}:${resolved.ruleKey}`,
    subscriptionId: sub.id,
    payload: {
      id: sub.id,
      name: sub.name,
      nextRenewalDate: sub.nextRenewalDate.toISOString(),
      notifyDaysBefore: sub.notifyDaysBefore,
      amount: sub.amount,
      currency: sub.currency,
      status: resolved.daysOverdue > 0 ? 'expired' : sub.status,
      tagNames: sub.tags.map((item) => item.tag.name),
      websiteUrl: sub.websiteUrl ?? '',
      notes: sub.notes ?? '',
      phase: resolved.eventType === 'subscription.overdue' ? 'overdue' : resolved.phase === 'due_today' ? 'due_today' : 'upcoming',
      daysUntilRenewal: resolved.daysUntilRenewal,
      daysOverdue: resolved.daysOverdue,
      reminderRuleTime: resolved.ruleTime,
      reminderRuleDays: resolved.eventType === 'subscription.overdue' ? resolved.daysOverdue : resolved.daysUntilRenewal
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
    const phaseWeight = (phase: ReminderPhase) => {
      if (phase === 'upcoming') return 1
      if (phase === 'due_today') return 2
      const overdueMatch = phase.match(/^overdue_day_(\d+)$/)
      if (overdueMatch) return 100 + Number(overdueMatch[1])
      return 999
    }

    return phaseWeight(a.phase) - phaseWeight(b.phase)
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
    reminderRuleTime: flattenedSubscriptions[0]?.reminderRuleTime ?? '00:00',
    reminderRuleDays: flattenedSubscriptions[0]?.reminderRuleDays ?? 0,
    subscriptions: flattenedSubscriptions
  }
}

export async function scanRenewalNotifications(
  today = new Date(),
  overrides: NotificationScanOverrides = {}
): Promise<NotificationScanResult> {
  const appSettings = {
    ...(await getNotificationScanSettings()),
    ...overrides
  }
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

  const now = dayjs(today).second(0).millisecond(0)
  const currentDay = now.startOf('day')
  const dispatchEntries: ReminderDispatchEntry[] = []
  const notifications: NotificationScanResult['notifications'] = []

  for (const sub of subscriptions) {
    const daysOverdue = Math.max(currentDay.diff(dayjs(sub.nextRenewalDate).startOf('day'), 'day'), 0)
    if (daysOverdue >= 1 && sub.status !== 'expired') {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' }
      })
    }

    const matches = resolveReminderMatches(now, sub, appSettings)
    for (const match of matches) {
      dispatchEntries.push(buildDispatchEntry(sub, match))
    }
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
    periodKey: `${toIsoDate(now.toDate())}:summary:${now.format('HH:mm')}`,
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
