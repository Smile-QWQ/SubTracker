export type ReminderRulesKind = 'advance' | 'overdue'

function parseReminderRules(value: string) {
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [days, time] = item.split('&')
      return {
        days: Number(days),
        time
      }
    })
    .filter((item) => Number.isFinite(item.days) && item.time)
}

export function formatReminderRulesText(
  value: string | null | undefined,
  kind: ReminderRulesKind,
  fallback = '沿用系统默认'
) {
  if (!value?.trim()) return fallback

  const parts = parseReminderRules(value)
  if (!parts.length) return fallback

  return parts
    .map((item) => {
      if (kind === 'advance') {
        return item.days === 0 ? `当天 ${item.time}` : `提前 ${item.days} 天 ${item.time}`
      }

      return `过期 ${item.days} 天 ${item.time}`
    })
    .join('；')
}
