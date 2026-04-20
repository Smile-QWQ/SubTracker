import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  DEFAULT_REMINDER_RULE_TIME
} from '@subtracker/shared'

export type ReminderRuleKind = 'advance' | 'overdue'

export type ReminderRule = {
  days: number
  time: string
  hour: number
  minute: number
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseRuleSegment(segment: string, kind: ReminderRuleKind): ReminderRule {
  const [rawDays, rawTime, ...rest] = segment.split('&').map((item) => item.trim())
  if (!rawDays || !rawTime || rest.length > 0) {
    throw new Error(`规则 "${segment}" 格式无效，应为 天数&HH:mm`)
  }

  if (!/^\d+$/.test(rawDays)) {
    throw new Error(`规则 "${segment}" 中的天数必须为整数`)
  }

  const days = Number(rawDays)
  if (!Number.isInteger(days)) {
    throw new Error(`规则 "${segment}" 中的天数必须为整数`)
  }

  if (kind === 'advance' && days < 0) {
    throw new Error(`规则 "${segment}" 中的天数不能小于 0`)
  }

  if (kind === 'overdue' && days < 1) {
    throw new Error(`规则 "${segment}" 中的天数必须大于等于 1`)
  }

  const timeMatch = rawTime.match(TIME_PATTERN)
  if (!timeMatch) {
    throw new Error(`规则 "${segment}" 中的时间必须为 HH:mm`)
  }

  return {
    days,
    time: rawTime,
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2])
  }
}

function compareRules(a: ReminderRule, b: ReminderRule, kind: ReminderRuleKind) {
  if (a.days !== b.days) {
    return kind === 'advance' ? b.days - a.days : a.days - b.days
  }
  return a.time.localeCompare(b.time)
}

function dedupeRules(rules: ReminderRule[]) {
  const seen = new Set<string>()
  const result: ReminderRule[] = []

  for (const rule of rules) {
    const key = `${rule.days}&${rule.time}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(rule)
  }

  return result
}

export function parseReminderRules(value: string, kind: ReminderRuleKind) {
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

export function normalizeReminderRules(value: string, kind: ReminderRuleKind) {
  const parsed = parseReminderRules(value, kind)
  return parsed.map((rule) => `${rule.days}&${rule.time};`).join('')
}

export function normalizeOptionalReminderRules(value: string | null | undefined, kind: ReminderRuleKind) {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed ? normalizeReminderRules(trimmed, kind) : ''
}

export function buildAdvanceReminderRulesFromLegacy(
  notifyDaysBefore: number,
  includeDueDay: boolean,
  dueDayTime = DEFAULT_REMINDER_RULE_TIME
) {
  const segments: string[] = []

  if (notifyDaysBefore > 0) {
    segments.push(`${notifyDaysBefore}&${dueDayTime}`)
  }

  if (includeDueDay) {
    segments.push(`0&${dueDayTime}`)
  }

  return normalizeReminderRules(segments.join(';'), 'advance')
}

export function buildAdvanceReminderRulesFromLegacyWithDefault(
  notifyDaysBefore: number,
  defaultAdvanceReminderRules: string
) {
  const dueDayRules = parseReminderRules(defaultAdvanceReminderRules, 'advance')
    .filter((rule) => rule.days === 0)
    .map((rule) => `${rule.days}&${rule.time}`)

  const segments = [
    ...(notifyDaysBefore > 0 ? [`${notifyDaysBefore}&${DEFAULT_REMINDER_RULE_TIME}`] : []),
    ...dueDayRules
  ]

  if (!segments.length) return ''
  return normalizeReminderRules(segments.join(';'), 'advance')
}

export function buildOverdueReminderRules(days: number[], time = DEFAULT_REMINDER_RULE_TIME) {
  const segments = days.filter((day) => day >= 1).map((day) => `${day}&${time}`)
  return segments.length ? normalizeReminderRules(segments.join(';'), 'overdue') : ''
}

export function deriveNotifyDaysBeforeFromAdvanceRules(value: string | null | undefined) {
  const rules = value ? parseReminderRules(value, 'advance') : []
  const firstPositive = rules.find((rule) => rule.days > 0)
  return firstPositive?.days ?? 0
}

export function deriveNotifyOnDueDayFromAdvanceRules(value: string | null | undefined) {
  return value ? parseReminderRules(value, 'advance').some((rule) => rule.days === 0) : false
}

export function deriveOverdueReminderDaysFromRules(value: string | null | undefined) {
  const days = value ? parseReminderRules(value, 'overdue').map((rule) => rule.days) : []
  return Array.from(new Set(days.filter((day): day is 1 | 2 | 3 => day === 1 || day === 2 || day === 3))).sort(
    (a, b) => a - b
  )
}

export function resolveDefaultAdvanceReminderRules(
  storedAdvanceRules?: string | null,
  legacyNotifyDays = 3,
  legacyNotifyOnDueDay = true
) {
  if (storedAdvanceRules && storedAdvanceRules.trim()) {
    return normalizeReminderRules(storedAdvanceRules, 'advance')
  }

  const built = buildAdvanceReminderRulesFromLegacy(legacyNotifyDays, legacyNotifyOnDueDay)
  return built || DEFAULT_ADVANCE_REMINDER_RULES
}

export function resolveDefaultOverdueReminderRules(storedOverdueRules?: string | null, legacyOverdueDays: number[] = [1, 2, 3]) {
  if (storedOverdueRules && storedOverdueRules.trim()) {
    return normalizeReminderRules(storedOverdueRules, 'overdue')
  }

  const built = buildOverdueReminderRules(legacyOverdueDays)
  return built || DEFAULT_OVERDUE_REMINDER_RULES
}
