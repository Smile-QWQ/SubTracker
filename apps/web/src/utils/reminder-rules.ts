import { getMessage } from '@subtracker/shared'
import { getAppLocale } from '@/locales'

export type ReminderRulesKind = 'advance' | 'overdue'

export type ReminderRuleEntry = {
  key: string
  days: number
  time: string
  description: string
}

export type ReminderRulesEvaluation = {
  title: string
  entries: ReminderRuleEntry[]
  error: string | null
  usingFallback: boolean
}

type ParsedReminderRule = {
  days: number
  time: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseRuleSegment(segment: string, kind: ReminderRulesKind): ParsedReminderRule {
  const locale = getAppLocale()
  const parts = segment
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length !== 2) {
    throw new Error(getMessage(locale, 'validation.reminderRules.invalidSegmentFormat', { segment }))
  }

  const [rawDays, rawTime] = parts
  if (!/^\d+$/.test(rawDays)) {
    throw new Error(getMessage(locale, 'validation.reminderRules.invalidDaysInteger', { segment }))
  }

  const days = Number(rawDays)
  if (kind === 'overdue' && days < 1) {
    throw new Error(getMessage(locale, 'validation.reminderRules.invalidOverdueDays', { segment }))
  }

  if (kind === 'advance' && days < 0) {
    throw new Error(getMessage(locale, 'validation.reminderRules.invalidAdvanceDays', { segment }))
  }

  if (!TIME_PATTERN.test(rawTime)) {
    throw new Error(getMessage(locale, 'validation.reminderRules.invalidTime', { segment }))
  }

  return {
    days,
    time: rawTime
  }
}

function compareRules(a: ParsedReminderRule, b: ParsedReminderRule, kind: ReminderRulesKind) {
  if (a.days !== b.days) {
    return kind === 'advance' ? b.days - a.days : a.days - b.days
  }

  return a.time.localeCompare(b.time)
}

function dedupeRules(rules: ParsedReminderRule[]) {
  const seen = new Set<string>()
  const result: ParsedReminderRule[] = []

  for (const rule of rules) {
    const key = `${rule.days}&${rule.time}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(rule)
  }

  return result
}

function parseReminderRulesStrict(value: string, kind: ReminderRulesKind) {
  const compact = value.replace(/\s+/g, '')
  if (!compact) return []

  const segments = compact
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)

  const parsed = dedupeRules(segments.map((segment) => parseRuleSegment(segment, kind)))
  parsed.sort((a, b) => compareRules(a, b, kind))
  return parsed
}

function toInlineDescription(rule: ParsedReminderRule, kind: ReminderRulesKind) {
  const locale = getAppLocale()
  if (kind === 'advance') {
    return rule.days === 0
      ? getMessage(locale, 'validation.reminderRules.inlineAdvanceSameDay', { time: rule.time })
      : getMessage(locale, 'validation.reminderRules.inlineAdvanceBefore', { days: rule.days, time: rule.time })
  }

  return getMessage(locale, 'validation.reminderRules.inlineOverdue', { days: rule.days, time: rule.time })
}

function toEvaluationDescription(rule: ParsedReminderRule, kind: ReminderRulesKind) {
  const locale = getAppLocale()
  if (kind === 'advance') {
    return rule.days === 0
      ? getMessage(locale, 'validation.reminderRules.evalAdvanceSameDay', { time: rule.time })
      : getMessage(locale, 'validation.reminderRules.evalAdvanceBefore', { days: rule.days, time: rule.time })
  }

  return getMessage(locale, 'validation.reminderRules.evalOverdue', { days: rule.days, time: rule.time })
}

export function formatReminderRulesText(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  fallback = getMessage(getAppLocale(), 'validation.reminderRules.fallback')
) {
  if (!value?.trim()) return fallback

  try {
    const parts = parseReminderRulesStrict(value, kind)
    if (!parts.length) return fallback
    return parts.map((item) => toInlineDescription(item, kind)).join('；')
  } catch {
    return fallback
  }
}

export function listReminderRuleDescriptions(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  fallback?: string | null | undefined
) {
  const currentValue = value?.trim() ?? ''

  try {
    const source = currentValue || fallback?.trim() || ''
    if (!source) return []
    const parts = parseReminderRulesStrict(source, kind)
    return parts.map((item) => ({
      key: `${item.days}&${item.time}`,
      description: toInlineDescription(item, kind)
    }))
  } catch {
    return []
  }
}

export function evaluateReminderRules(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  options?: {
    fallbackValue?: string | null | undefined
    fallbackLabel?: string
    emptyTitle?: string
  }
): ReminderRulesEvaluation {
  const locale = getAppLocale()
  const fallbackLabel = options?.fallbackLabel ?? getMessage(locale, 'validation.reminderRules.defaultRulesLabel')
  const emptyTitle = options?.emptyTitle ?? getMessage(locale, 'validation.reminderRules.emptyTitle')
  const currentValue = value?.trim() ?? ''

  if (!currentValue) {
    const fallbackValue = options?.fallbackValue?.trim() ?? ''
    if (!fallbackValue) {
      return {
        title: emptyTitle,
        entries: [],
        error: null,
        usingFallback: false
      }
    }

    try {
      const parsed = parseReminderRulesStrict(fallbackValue, kind)
      return {
        title: getMessage(locale, 'validation.reminderRules.fallbackPreviewTitle', { label: fallbackLabel }),
        entries: parsed.map((rule) => ({
          key: `${rule.days}&${rule.time}`,
          days: rule.days,
          time: rule.time,
          description: toEvaluationDescription(rule, kind)
        })),
        error: null,
        usingFallback: true
      }
    } catch (error) {
      return {
        title: getMessage(locale, 'validation.reminderRules.fallbackInvalidTitle', { label: fallbackLabel }),
        entries: [],
        error: error instanceof Error ? error.message : getMessage(locale, 'validation.reminderRules.parseFailed'),
        usingFallback: true
      }
    }
  }

  try {
    const parsed = parseReminderRulesStrict(currentValue, kind)
    return {
      title: getMessage(locale, 'validation.reminderRules.resultTitle'),
      entries: parsed.map((rule) => ({
        key: `${rule.days}&${rule.time}`,
        days: rule.days,
        time: rule.time,
        description: toEvaluationDescription(rule, kind)
      })),
      error: null,
      usingFallback: false
    }
  } catch (error) {
    return {
      title: getMessage(locale, 'validation.reminderRules.invalidTitle'),
      entries: [],
      error: error instanceof Error ? error.message : getMessage(locale, 'validation.reminderRules.parseFailed'),
      usingFallback: false
    }
  }
}
