import { DEFAULT_APP_LOCALE, getMessage, type AppLocale } from '@subtracker/shared'

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

type ReminderRulesI18n = {
  fallback: string
  emptyTitle: string
  resultTitle: string
  invalidTitle: string
  defaultRulesLabel: string
  defaultAdvanceRulesLabel: string
  defaultOverdueRulesLabel: string
  fallbackPreviewTitle: string
  fallbackInvalidTitle: string
  noAdvance: string
  noOverdue: string
  parseFailed: string
  invalidSegmentFormat: string
  invalidDaysInteger: string
  invalidOverdueDays: string
  invalidAdvanceDays: string
  invalidTime: string
  inlineAdvanceSameDay: string
  inlineAdvanceBefore: string
  inlineOverdue: string
  evalAdvanceSameDay: string
  evalAdvanceBefore: string
  evalOverdue: string
}

type ParsedReminderRule = {
  days: number
  time: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function formatI18n(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(params[key] ?? `{${key}}`))
}

export function getDefaultReminderRulesI18n(locale: AppLocale = DEFAULT_APP_LOCALE): ReminderRulesI18n {
  return {
    fallback: getMessage(locale, 'validation.reminderRules.fallback'),
    emptyTitle: getMessage(locale, 'validation.reminderRules.emptyTitle'),
    resultTitle: getMessage(locale, 'validation.reminderRules.resultTitle'),
    invalidTitle: getMessage(locale, 'validation.reminderRules.invalidTitle'),
    defaultRulesLabel: getMessage(locale, 'validation.reminderRules.defaultRulesLabel'),
    defaultAdvanceRulesLabel: getMessage(locale, 'validation.reminderRules.defaultAdvanceRulesLabel'),
    defaultOverdueRulesLabel: getMessage(locale, 'validation.reminderRules.defaultOverdueRulesLabel'),
    fallbackPreviewTitle: getMessage(locale, 'validation.reminderRules.fallbackPreviewTitle', { label: '{label}' }),
    fallbackInvalidTitle: getMessage(locale, 'validation.reminderRules.fallbackInvalidTitle', { label: '{label}' }),
    noAdvance: getMessage(locale, 'validation.reminderRules.noAdvance'),
    noOverdue: getMessage(locale, 'validation.reminderRules.noOverdue'),
    parseFailed: getMessage(locale, 'validation.reminderRules.parseFailed'),
    invalidSegmentFormat: getMessage(locale, 'validation.reminderRules.invalidSegmentFormat', { segment: '{segment}' }),
    invalidDaysInteger: getMessage(locale, 'validation.reminderRules.invalidDaysInteger', { segment: '{segment}' }),
    invalidOverdueDays: getMessage(locale, 'validation.reminderRules.invalidOverdueDays', { segment: '{segment}' }),
    invalidAdvanceDays: getMessage(locale, 'validation.reminderRules.invalidAdvanceDays', { segment: '{segment}' }),
    invalidTime: getMessage(locale, 'validation.reminderRules.invalidTime', { segment: '{segment}' }),
    inlineAdvanceSameDay: getMessage(locale, 'validation.reminderRules.inlineAdvanceSameDay', { time: '{time}' }),
    inlineAdvanceBefore: getMessage(locale, 'validation.reminderRules.inlineAdvanceBefore', { days: '{days}', time: '{time}' }),
    inlineOverdue: getMessage(locale, 'validation.reminderRules.inlineOverdue', { days: '{days}', time: '{time}' }),
    evalAdvanceSameDay: getMessage(locale, 'validation.reminderRules.evalAdvanceSameDay', { time: '{time}' }),
    evalAdvanceBefore: getMessage(locale, 'validation.reminderRules.evalAdvanceBefore', { days: '{days}', time: '{time}' }),
    evalOverdue: getMessage(locale, 'validation.reminderRules.evalOverdue', { days: '{days}', time: '{time}' })
  }
}

function parseRuleSegment(segment: string, kind: ReminderRulesKind, copy: ReminderRulesI18n): ParsedReminderRule {
  const parts = segment
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length !== 2) {
    throw new Error(formatI18n(copy.invalidSegmentFormat, { segment }))
  }

  const [rawDays, rawTime] = parts
  if (!/^\d+$/.test(rawDays)) {
    throw new Error(formatI18n(copy.invalidDaysInteger, { segment }))
  }

  const days = Number(rawDays)
  if (kind === 'overdue' && days < 1) {
    throw new Error(formatI18n(copy.invalidOverdueDays, { segment }))
  }

  if (kind === 'advance' && days < 0) {
    throw new Error(formatI18n(copy.invalidAdvanceDays, { segment }))
  }

  if (!TIME_PATTERN.test(rawTime)) {
    throw new Error(formatI18n(copy.invalidTime, { segment }))
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

function parseReminderRulesStrict(value: string, kind: ReminderRulesKind, copy: ReminderRulesI18n) {
  const compact = value.replace(/\s+/g, '')
  if (!compact) return []

  const segments = compact
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)

  const parsed = dedupeRules(segments.map((segment) => parseRuleSegment(segment, kind, copy)))
  parsed.sort((a, b) => compareRules(a, b, kind))
  return parsed
}

function toInlineDescription(rule: ParsedReminderRule, kind: ReminderRulesKind, copy: ReminderRulesI18n) {
  if (kind === 'advance') {
    return rule.days === 0
      ? formatI18n(copy.inlineAdvanceSameDay, { time: rule.time })
      : formatI18n(copy.inlineAdvanceBefore, { days: rule.days, time: rule.time })
  }

  return formatI18n(copy.inlineOverdue, { days: rule.days, time: rule.time })
}

function toEvaluationDescription(rule: ParsedReminderRule, kind: ReminderRulesKind, copy: ReminderRulesI18n) {
  if (kind === 'advance') {
    return rule.days === 0
      ? formatI18n(copy.evalAdvanceSameDay, { time: rule.time })
      : formatI18n(copy.evalAdvanceBefore, { days: rule.days, time: rule.time })
  }

  return formatI18n(copy.evalOverdue, { days: rule.days, time: rule.time })
}

export function formatReminderRulesText(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  fallback?: string,
  options?: {
    i18n?: Partial<ReminderRulesI18n>
  }
) {
  const copy = { ...getDefaultReminderRulesI18n(), ...options?.i18n }
  const fallbackText = fallback ?? copy.fallback
  if (!value?.trim()) return fallbackText

  try {
    const parts = parseReminderRulesStrict(value, kind, copy)
    if (!parts.length) return fallbackText
    return parts.map((item) => toInlineDescription(item, kind, copy)).join('；')
  } catch {
    return fallbackText
  }
}

export function listReminderRuleDescriptions(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  fallback?: string | null | undefined,
  options?: {
    i18n?: Partial<ReminderRulesI18n>
  }
) {
  const copy = { ...getDefaultReminderRulesI18n(), ...options?.i18n }
  const currentValue = value?.trim() ?? ''

  try {
    const source = currentValue || fallback?.trim() || ''
    if (!source) return []
    const parts = parseReminderRulesStrict(source, kind, copy)
    return parts.map((item) => ({
      key: `${item.days}&${item.time}`,
      description: toInlineDescription(item, kind, copy)
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
    i18n?: Partial<ReminderRulesI18n>
  }
): ReminderRulesEvaluation {
  const copy = { ...getDefaultReminderRulesI18n(), ...options?.i18n }
  const fallbackLabel =
    options?.fallbackLabel ??
    (kind === 'advance' ? copy.defaultAdvanceRulesLabel : kind === 'overdue' ? copy.defaultOverdueRulesLabel : copy.defaultRulesLabel)
  const emptyTitle = options?.emptyTitle ?? (kind === 'advance' ? copy.noAdvance : copy.noOverdue)
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
      const parsed = parseReminderRulesStrict(fallbackValue, kind, copy)
      return {
        title: formatI18n(copy.fallbackPreviewTitle, { label: fallbackLabel }),
        entries: parsed.map((rule) => ({
          key: `${rule.days}&${rule.time}`,
          days: rule.days,
          time: rule.time,
          description: toEvaluationDescription(rule, kind, copy)
        })),
        error: null,
        usingFallback: true
      }
    } catch (error) {
      return {
        title: formatI18n(copy.fallbackInvalidTitle, { label: fallbackLabel }),
        entries: [],
        error: error instanceof Error ? error.message : copy.parseFailed,
        usingFallback: true
      }
    }
  }

  try {
    const parsed = parseReminderRulesStrict(currentValue, kind, copy)
    return {
      title: copy.resultTitle,
      entries: parsed.map((rule) => ({
        key: `${rule.days}&${rule.time}`,
        days: rule.days,
        time: rule.time,
        description: toEvaluationDescription(rule, kind, copy)
      })),
      error: null,
      usingFallback: false
    }
  } catch (error) {
    return {
      title: copy.invalidTitle,
      entries: [],
      error: error instanceof Error ? error.message : copy.parseFailed,
      usingFallback: false
    }
  }
}
