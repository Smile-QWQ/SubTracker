import { type WebhookEventType } from '@subtracker/shared'

export type NotificationEntryPayload = {
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

export type NotificationSummarySection = {
  phase: string
  title: string
  eventType: WebhookEventType
  subscriptions: NotificationEntryPayload[]
}

export type NotificationDedupEntry = {
  eventType: WebhookEventType
  phase: string
  resourceKey: string
  periodKey: string
  subscriptionId?: string
  payload: NotificationEntryPayload
}

export type NotificationDispatchParams = {
  eventType: WebhookEventType
  resourceKey: string
  periodKey: string
  subscriptionId?: string
  payload: Record<string, unknown>
  dedupEntries?: NotificationDedupEntry[]
}

type NotificationMergedPayload = {
  merged: true
  mergedCount: number
  mergedSections: NotificationSummarySection[]
  name: string
  nextRenewalDate: string
  notifyDaysBefore: number
  amount: number
  currency: string
  status: string
  tagNames: string[]
  websiteUrl: string
  notes: string
  phase: 'summary'
  daysUntilRenewal: number
  daysOverdue: number
  reminderRuleTime: string
  reminderRuleDays: number
  subscriptions: NotificationEntryPayload[]
}

function getSummaryPhaseTitle(phase: string) {
  if (phase === 'upcoming') return '即将到期'
  if (phase === 'due_today') return '今天到期'

  const overdueMatch = phase.match(/^overdue_day_(\d+)$/)
  if (overdueMatch) {
    return `已过期第 ${overdueMatch[1]} 天`
  }

  return phase
}

export function buildMergedSummarySections(entries: NotificationDedupEntry[]): NotificationSummarySection[] {
  const groups = new Map<string, NotificationSummarySection>()

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
    const phaseWeight = (phase: string) => {
      if (phase === 'upcoming') return 1
      if (phase === 'due_today') return 2
      const overdueMatch = phase.match(/^overdue_day_(\d+)$/)
      if (overdueMatch) return 100 + Number(overdueMatch[1])
      return 999
    }

    return phaseWeight(a.phase) - phaseWeight(b.phase)
  })
}

export function buildMergedPayload(entries: NotificationDedupEntry[]): NotificationMergedPayload {
  const sections = buildMergedSummarySections(entries)
  const flattenedSubscriptions = sections.flatMap((section) => section.subscriptions)
  const hasOverdue = sections.some((section) => section.eventType === 'subscription.overdue')

  return {
    merged: true,
    mergedCount: flattenedSubscriptions.length,
    mergedSections: sections,
    name: `共 ${flattenedSubscriptions.length} 项订阅`,
    nextRenewalDate: flattenedSubscriptions[0]?.nextRenewalDate ?? '',
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

export function buildMergedPeriodKey(entries: Array<Pick<NotificationDedupEntry, 'periodKey'>>) {
  return entries.map((entry) => entry.periodKey).sort().join('|')
}

export function buildDispatchParamsFromDedupEntries(
  entries: NotificationDedupEntry[],
  fallback?: Partial<Pick<NotificationDispatchParams, 'resourceKey' | 'periodKey'>>
): NotificationDispatchParams {
  if (entries.length === 0) {
    throw new Error('Cannot build notification dispatch params from empty dedup entries')
  }

  if (entries.length === 1) {
    const [entry] = entries
    return {
      eventType: entry.eventType,
      resourceKey: entry.resourceKey,
      periodKey: entry.periodKey,
      subscriptionId: entry.subscriptionId,
      payload: entry.payload,
      dedupEntries: [entry]
    }
  }

  return {
    eventType: entries.some((entry) => entry.eventType === 'subscription.overdue')
      ? 'subscription.overdue'
      : 'subscription.reminder_due',
    resourceKey: fallback?.resourceKey ?? 'subscriptions:scan-summary',
    periodKey: fallback?.periodKey ?? `summary:${buildMergedPeriodKey(entries)}`,
    payload: buildMergedPayload(entries),
    dedupEntries: entries
  }
}
