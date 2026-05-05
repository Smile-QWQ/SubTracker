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
  const parts = segment
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length !== 2) {
    throw new Error(`规则 "${segment}" 格式无效，应为 天数&HH:mm`)
  }

  const [rawDays, rawTime] = parts
  if (!/^\d+$/.test(rawDays)) {
    throw new Error(`规则 "${segment}" 中的天数必须为整数`)
  }

  const days = Number(rawDays)
  if (kind === 'overdue' && days < 1) {
    throw new Error(`规则 "${segment}" 中的天数必须大于等于 1`)
  }

  if (kind === 'advance' && days < 0) {
    throw new Error(`规则 "${segment}" 中的天数不能小于 0`)
  }

  if (!TIME_PATTERN.test(rawTime)) {
    throw new Error(`规则 "${segment}" 中的时间必须为 HH:mm`)
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
  if (kind === 'advance') {
    return rule.days === 0 ? `当天 ${rule.time}` : `提前 ${rule.days} 天 ${rule.time}`
  }

  return `过期 ${rule.days} 天 ${rule.time}`
}

function toEvaluationDescription(rule: ParsedReminderRule, kind: ReminderRulesKind) {
  if (kind === 'advance') {
    return rule.days === 0 ? `到期当天 ${rule.time} 提醒` : `提前 ${rule.days} 天 ${rule.time} 提醒`
  }

  return `过期 ${rule.days} 天 ${rule.time} 提醒`
}

export function formatReminderRulesText(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  fallback = '沿用系统默认'
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

export function evaluateReminderRules(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  options?: {
    fallbackValue?: string | null | undefined
    fallbackLabel?: string
    emptyTitle?: string
  }
): ReminderRulesEvaluation {
  const fallbackLabel = options?.fallbackLabel ?? '系统默认规则'
  const emptyTitle = options?.emptyTitle ?? '请先输入规则后再演算'
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
        title: `当前未填写，以下按${fallbackLabel}演算`,
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
        title: `${fallbackLabel}格式有误`,
        entries: [],
        error: error instanceof Error ? error.message : '规则解析失败',
        usingFallback: true
      }
    }
  }

  try {
    const parsed = parseReminderRulesStrict(currentValue, kind)
    return {
      title: '演算结果',
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
      title: '规则格式有误',
      entries: [],
      error: error instanceof Error ? error.message : '规则解析失败',
      usingFallback: false
    }
  }
}
