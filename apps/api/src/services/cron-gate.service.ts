import { formatDateInTimezone, toTimezonedDayjs } from '../utils/timezone'
import { getSetting, setSetting } from './settings.service'

function buildDailyTaskStateKey(taskKey: string, timezone: string) {
  return `__cron_last_run:${taskKey}:${timezone}`
}

export function parseDailyCronForTimezoneGate(cronExpression: string) {
  const match = cronExpression.trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
  if (!match) return null

  const minute = Number(match[1])
  const localHour = Number(match[2])
  if (!Number.isInteger(minute) || !Number.isInteger(localHour)) return null
  if (minute < 0 || minute > 59 || localHour < 0 || localHour > 23) return null

  return {
    triggerCron: `${minute} * * * *`,
    localHour
  }
}

export async function runDailyTaskAtLocalHour(
  taskKey: string,
  timezone: string,
  localHour: number,
  now: Date,
  execute: () => Promise<void>
) {
  const localNow = toTimezonedDayjs(now, timezone)
  if (localNow.hour() !== localHour) {
    return false
  }

  const today = formatDateInTimezone(now, timezone)
  const stateKey = buildDailyTaskStateKey(taskKey, timezone)
  const lastRun = await getSetting<string | null>(stateKey, null)
  if (lastRun === today) {
    return false
  }

  await execute()
  await setSetting(stateKey, today)
  return true
}
