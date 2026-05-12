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
import {
  endOfDayDateInTimezone,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  getNowInTimezone,
  startOfDayDateInTimezone,
  toTimezonedDayjs
} from '../utils/timezone'
import {
  buildDispatchParamsFromDedupEntries,
  buildMergedPayload,
  buildMergedPeriodKey,
  type NotificationDedupEntry,
  type NotificationDispatchParams,
  type NotificationEntryPayload,
  type NotificationSummarySection
} from './notification-merge.service'

export type ReminderPhase = 'upcoming' | 'due_today' | `overdue_day_${number}`

export type NotificationScanResult = {
  processedCount: number
  matchedReminderCount: number
  notificationCount: number
  scan: {
    scanTime: string
    timezone: string
    defaultAdvanceReminderRules: string
    defaultOverdueReminderRules: string
    maxAdvanceDays: number
    mergeMultiSubscriptionNotifications: boolean
    queryWindow: {
      start: string
      defaultRuleEnd: string
      customRuleEnd: string
      customRuleLookaheadDays: number
    }
  }
  candidates: ReminderDebugCandidate[]
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
> & {
  dryRun?: boolean
}

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

type ReminderEntryPayload = NotificationEntryPayload
type ReminderDispatchEntry = NotificationDedupEntry & { phase: ReminderPhase; subscriptionId: string }

type ReminderDebugCandidate = {
  subscriptionId: string
  subscriptionName: string
  status: string
  nextRenewalDate: string
  advanceReminderRulesSource: 'subscription' | 'default' | 'legacy'
  advanceReminderRules: string
  overdueReminderRulesSource: 'subscription' | 'default'
  overdueReminderRules: string
  matchedRules: Array<{
    eventType: 'subscription.reminder_due' | 'subscription.overdue'
    phase: ReminderPhase
    ruleKey: string
    ruleTime: string
    daysUntilRenewal: number
    daysOverdue: number
  }>
}

type ReminderSummarySection = NotificationSummarySection & { phase: ReminderPhase }

type ReminderMatch = {
  eventType: 'subscription.reminder_due' | 'subscription.overdue'
  phase: ReminderPhase
  title: string
  daysUntilRenewal: number
  daysOverdue: number
  ruleTime: string
  ruleKey: string
}

const CUSTOM_REMINDER_RULE_LOOKAHEAD_DAYS = 366

function getOverduePhase(daysOverdue: number): ReminderPhase {
  return `overdue_day_${daysOverdue}`
}

function buildReminderTitle(eventType: 'subscription.reminder_due' | 'subscription.overdue', days: number) {
  if (eventType === 'subscription.reminder_due') {
    return days === 0 ? '今天到期' : `还有 ${days} 天到期`
  }

  return `已过期第 ${days} 天`
}

function resolveAdvanceRules(sub: ReminderSubscriptionLike, defaultAdvanceReminderRules: string) {
  return parseReminderRules(resolveAdvanceRuleSet(sub, defaultAdvanceReminderRules).rules, 'advance')
}

function resolveAdvanceRuleSet(sub: ReminderSubscriptionLike, defaultAdvanceReminderRules: string) {
  if (sub.advanceReminderRules === '') {
    return {
      source: 'default' as const,
      rules: defaultAdvanceReminderRules
    }
  }

  if (sub.advanceReminderRules?.trim()) {
    return {
      source: 'subscription' as const,
      rules: sub.advanceReminderRules
    }
  }

  const legacyRules = buildAdvanceReminderRulesFromLegacyWithDefault(sub.notifyDaysBefore, defaultAdvanceReminderRules)
  return {
    source: 'legacy' as const,
    rules: legacyRules || defaultAdvanceReminderRules
  }
}

function resolveOverdueRules(sub: ReminderSubscriptionLike, defaultOverdueReminderRules: string) {
  return parseReminderRules(resolveOverdueRuleSet(sub, defaultOverdueReminderRules).rules, 'overdue')
}

function resolveOverdueRuleSet(sub: ReminderSubscriptionLike, defaultOverdueReminderRules: string) {
  if (sub.overdueReminderRules === '') {
    return {
      source: 'default' as const,
      rules: defaultOverdueReminderRules
    }
  }

  if (sub.overdueReminderRules?.trim()) {
    return {
      source: 'subscription' as const,
      rules: sub.overdueReminderRules
    }
  }

  return {
    source: 'default' as const,
    rules: defaultOverdueReminderRules
  }
}

function resolveRuleTriggerMoment(
  nextRenewalDate: Date,
  rule: ReminderRule,
  direction: 'advance' | 'overdue',
  timezone: string
) {
  const renewalDay = toTimezonedDayjs(nextRenewalDate, timezone).startOf('day')
  const base = direction === 'advance' ? renewalDay.subtract(rule.days, 'day') : renewalDay.add(rule.days, 'day')
  return base.hour(rule.hour).minute(rule.minute).second(0).millisecond(0)
}

function matchReminderRule(
  now: dayjs.Dayjs,
  nextRenewalDate: Date,
  rule: ReminderRule,
  direction: 'advance' | 'overdue',
  timezone: string
): ReminderMatch | null {
  const trigger = resolveRuleTriggerMoment(nextRenewalDate, rule, direction, timezone)
  const normalizedNow = now.second(0).millisecond(0)
  const normalizedTrigger = trigger.second(0).millisecond(0)
  if (!normalizedNow.isSame(normalizedTrigger, 'day') || normalizedNow.isBefore(normalizedTrigger)) {
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
    const match = matchReminderRule(now, sub.nextRenewalDate, rule, 'advance', settings.timezone)
    if (match) {
      matches.push(match)
    }
  }

  for (const rule of resolveOverdueRules(sub, settings.defaultOverdueReminderRules)) {
    const match = matchReminderRule(now, sub.nextRenewalDate, rule, 'overdue', settings.timezone)
    if (match) {
      matches.push(match)
    }
  }

  return matches
}

function getMaxAdvanceReminderDays(defaultAdvanceReminderRules: string) {
  const rules = parseReminderRules(defaultAdvanceReminderRules, 'advance')
  return rules.reduce((max, rule) => Math.max(max, rule.days), 0)
}

function buildDispatchEntry(
  sub: ReminderSubscriptionLike,
  resolved: ReminderMatch,
  timezone: string
): ReminderDispatchEntry {
  return {
    eventType: resolved.eventType,
    phase: resolved.phase,
    resourceKey: `subscription:${sub.id}`,
    periodKey: `${toIsoDate(sub.nextRenewalDate, timezone)}:${resolved.phase}:${resolved.ruleKey}`,
    subscriptionId: sub.id,
    payload: {
      id: sub.id,
      name: sub.name,
      nextRenewalDate: formatDateInTimezone(sub.nextRenewalDate, timezone),
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

function buildScanDiagnostics(input: {
  now: dayjs.Dayjs
  settings: Awaited<ReturnType<typeof getNotificationScanSettings>>
  maxAdvanceDays: number
  queryStart: Date
  defaultRuleQueryEnd: Date
  customRuleQueryEnd: Date
}) {
  return {
    scanTime: formatDateTimeInTimezone(input.now.toDate(), input.settings.timezone),
    timezone: input.settings.timezone,
    defaultAdvanceReminderRules: input.settings.defaultAdvanceReminderRules,
    defaultOverdueReminderRules: input.settings.defaultOverdueReminderRules,
    maxAdvanceDays: input.maxAdvanceDays,
    mergeMultiSubscriptionNotifications: input.settings.mergeMultiSubscriptionNotifications,
    queryWindow: {
      start: formatDateTimeInTimezone(input.queryStart, input.settings.timezone),
      defaultRuleEnd: formatDateTimeInTimezone(input.defaultRuleQueryEnd, input.settings.timezone),
      customRuleEnd: formatDateTimeInTimezone(input.customRuleQueryEnd, input.settings.timezone),
      customRuleLookaheadDays: CUSTOM_REMINDER_RULE_LOOKAHEAD_DAYS
    }
  }
}

function buildDebugCandidate(
  sub: ReminderSubscriptionLike,
  matches: ReminderMatch[],
  settings: Awaited<ReturnType<typeof getNotificationScanSettings>>
): ReminderDebugCandidate {
  const advance = resolveAdvanceRuleSet(sub, settings.defaultAdvanceReminderRules)
  const overdue = resolveOverdueRuleSet(sub, settings.defaultOverdueReminderRules)

  return {
    subscriptionId: sub.id,
    subscriptionName: sub.name,
    status: sub.status,
    nextRenewalDate: formatDateInTimezone(sub.nextRenewalDate, settings.timezone),
    advanceReminderRulesSource: advance.source,
    advanceReminderRules: advance.rules,
    overdueReminderRulesSource: overdue.source,
    overdueReminderRules: overdue.rules,
    matchedRules: matches.map((match) => ({
      eventType: match.eventType,
      phase: match.phase,
      ruleKey: match.ruleKey,
      ruleTime: match.ruleTime,
      daysUntilRenewal: match.daysUntilRenewal,
      daysOverdue: match.daysOverdue
    }))
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
  const dryRun = overrides.dryRun ?? false
  const now = getNowInTimezone(today, appSettings.timezone).second(0).millisecond(0)
  const currentDay = now.startOf('day')
  const maxAdvanceDays = getMaxAdvanceReminderDays(appSettings.defaultAdvanceReminderRules)
  const queryStart = startOfDayDateInTimezone(currentDay.subtract(7, 'day').toDate(), appSettings.timezone)
  const defaultRuleQueryEnd = endOfDayDateInTimezone(
    currentDay.add(maxAdvanceDays, 'day').toDate(),
    appSettings.timezone
  )
  const customRuleQueryEnd = endOfDayDateInTimezone(
    currentDay.add(Math.max(maxAdvanceDays, CUSTOM_REMINDER_RULE_LOOKAHEAD_DAYS), 'day').toDate(),
    appSettings.timezone
  )
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['active', 'expired'] },
      webhookEnabled: true,
      nextRenewalDate: {
        gte: queryStart,
        lte: customRuleQueryEnd
      },
      OR: [
        {
          nextRenewalDate: {
            lte: defaultRuleQueryEnd
          }
        },
        {
          AND: [
            {
              advanceReminderRules: {
                not: null
              }
            },
            {
              advanceReminderRules: {
                not: ''
              }
            }
          ]
        },
        {
          notifyDaysBefore: {
            gt: maxAdvanceDays
          }
        }
      ]
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    }
  })
  const scan = buildScanDiagnostics({
    now,
    settings: appSettings,
    maxAdvanceDays,
    queryStart,
    defaultRuleQueryEnd,
    customRuleQueryEnd
  })

  const dispatchEntries: ReminderDispatchEntry[] = []
  const candidates: ReminderDebugCandidate[] = []
  const notifications: NotificationScanResult['notifications'] = []

  for (const sub of subscriptions) {
    const matches = resolveReminderMatches(now, sub, appSettings)
    candidates.push(buildDebugCandidate(sub, matches, appSettings))
    for (const match of matches) {
      dispatchEntries.push(buildDispatchEntry(sub, match, appSettings.timezone))
    }
  }

  if (!appSettings.mergeMultiSubscriptionNotifications || dispatchEntries.length <= 1) {
    for (const entry of dispatchEntries) {
      const channelResults = dryRun
        ? [
            {
              channel: 'email' as const,
              status: 'skipped' as const,
              message: 'dry_run'
            }
          ]
        : await dispatchNotificationEvent(buildDispatchParamsFromDedupEntries([entry]))

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
      matchedReminderCount: dispatchEntries.length,
      notificationCount: notifications.length,
      scan,
      candidates,
      notifications
    }
  }

  const mergedPayload = buildMergedPayload(dispatchEntries)
  const mergedParams: NotificationDispatchParams = buildDispatchParamsFromDedupEntries(dispatchEntries, {
    resourceKey: 'subscriptions:scan-summary',
    periodKey: `${toIsoDate(now.toDate(), appSettings.timezone)}:summary:${buildMergedPeriodKey(dispatchEntries)}`
  })
  const channelResults = dryRun
    ? [
        {
          channel: 'email' as const,
          status: 'skipped' as const,
          message: 'dry_run'
        }
      ]
    : await dispatchNotificationEvent(mergedParams)

  notifications.push({
    subscriptionId: 'merged:summary',
    subscriptionName: `共 ${dispatchEntries.length} 项订阅`,
    phase: dispatchEntries[0].phase,
    eventType: mergedParams.eventType,
    daysUntilRenewal: Math.min(...dispatchEntries.map((entry) => entry.payload.daysUntilRenewal)),
    daysOverdue: Math.max(...dispatchEntries.map((entry) => entry.payload.daysOverdue)),
    channelResults
  })

  return {
    processedCount: subscriptions.length,
    matchedReminderCount: dispatchEntries.length,
    notificationCount: notifications.length,
    scan,
    candidates,
    notifications
  }
}
