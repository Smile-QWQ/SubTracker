import { getSetting, setSetting } from './settings.service'
import { formatDateInTimezone, toTimezonedDayjs } from '../utils/timezone'

function buildDailyTaskStateKey(taskKey: string, timezone: string) {
  return `__worker_cron_last_run:${taskKey}:${timezone}`
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
