import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { DEFAULT_TIMEZONE } from '@subtracker/shared'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const DEFAULT_APP_TIMEZONE = DEFAULT_TIMEZONE

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function buildSupportedTimezones() {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }).supportedValuesOf
  const timeZones = supportedValuesOf?.('timeZone') ?? []
  return ['UTC', ...timeZones.filter((item) => item !== 'UTC')]
}

export function normalizeAppTimezone(timezoneValue?: string | null) {
  const candidate = String(timezoneValue ?? '').trim()
  if (!candidate) return DEFAULT_APP_TIMEZONE
  return isValidTimeZone(candidate) ? candidate : DEFAULT_APP_TIMEZONE
}

export function getNowInTimezone(value: Date | string = new Date(), timezoneValue = DEFAULT_APP_TIMEZONE) {
  return dayjs(value).tz(normalizeAppTimezone(timezoneValue))
}

export function toTimezonedDayjs(value: Date | string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return dayjs(value).tz(normalizeAppTimezone(timezoneValue))
}

export function parseDateInTimezone(value: string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return dayjs.tz(value, 'YYYY-MM-DD', normalizeAppTimezone(timezoneValue)).startOf('day').toDate()
}

export function startOfDayDateInTimezone(value: Date | string = new Date(), timezoneValue = DEFAULT_APP_TIMEZONE) {
  return getNowInTimezone(value, timezoneValue).startOf('day').toDate()
}

export function endOfDayDateInTimezone(value: Date | string = new Date(), timezoneValue = DEFAULT_APP_TIMEZONE) {
  return getNowInTimezone(value, timezoneValue).endOf('day').toDate()
}

export function startOfMonthDateInTimezone(value: Date | string = new Date(), timezoneValue = DEFAULT_APP_TIMEZONE) {
  return getNowInTimezone(value, timezoneValue).startOf('month').toDate()
}

export function endOfMonthDateInTimezone(value: Date | string = new Date(), timezoneValue = DEFAULT_APP_TIMEZONE) {
  return getNowInTimezone(value, timezoneValue).endOf('month').toDate()
}

export function formatDateInTimezone(value: Date | string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
  return toTimezonedDayjs(value, timezoneValue).format('YYYY-MM-DD')
}

export function formatDateTimeInTimezone(value: Date | string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return toTimezonedDayjs(value, timezoneValue).format('YYYY-MM-DD HH:mm:ss')
}

export function monthKeyInTimezone(value: Date | string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return toTimezonedDayjs(value, timezoneValue).format('YYYY-MM')
}
