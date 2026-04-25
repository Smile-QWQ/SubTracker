import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const DEFAULT_APP_TIMEZONE = 'Asia/Shanghai'

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function normalizeAppTimezone(value?: string | null) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return DEFAULT_APP_TIMEZONE
  return isValidTimeZone(candidate) ? candidate : DEFAULT_APP_TIMEZONE
}

export function getSupportedTimeZones() {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }).supportedValuesOf
  const values = supportedValuesOf?.('timeZone') ?? []
  return ['UTC', ...values.filter((item) => item !== 'UTC')]
}

function buildOffsetLabel(timeZone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit'
    }).formatToParts(now)
    return parts.find((item) => item.type === 'timeZoneName')?.value ?? timeZone
  } catch {
    return timeZone
  }
}

export function buildTimeZoneOptions(now = new Date()) {
  return getSupportedTimeZones().map((timeZone) => ({
    label: `${timeZone} (${buildOffsetLabel(timeZone, now)})`,
    value: timeZone
  }))
}

function toTimezonedDayjs(value: Date | string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return dayjs(value).tz(normalizeAppTimezone(timezoneValue))
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

function dateStringToLocalNoonTs(dateString: string) {
  const [year, month, day] = dateString.split('-').map((item) => Number(item))
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime()
}

export function businessDateToPickerTs(value: Date | string, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return dateStringToLocalNoonTs(formatDateInTimezone(value, timezoneValue))
}

export function currentBusinessDatePickerTs(timezoneValue = DEFAULT_APP_TIMEZONE, now: Date | string = new Date()) {
  return businessDateToPickerTs(now, timezoneValue)
}

export function currentBusinessDateString(timezoneValue = DEFAULT_APP_TIMEZONE, now: Date | string = new Date()) {
  return formatDateInTimezone(now, timezoneValue)
}

export function pickerTsToDateString(timestamp: number) {
  return dayjs(timestamp).format('YYYY-MM-DD')
}

export function pickerTsToMonthKey(timestamp: number) {
  return pickerTsToDateString(timestamp).slice(0, 7)
}

export function monthKeyToPickerTs(monthKey: string) {
  return dateStringToLocalNoonTs(`${monthKey}-01`)
}

export function shiftMonthKey(monthKey: string, delta: number) {
  return dayjs.utc(`${monthKey}-01`, 'YYYY-MM-DD', true).add(delta, 'month').format('YYYY-MM')
}

export function daysInMonthFromMonthKey(monthKey: string) {
  return dayjs.utc(`${monthKey}-01`, 'YYYY-MM-DD', true).daysInMonth()
}

export function monthRangeFromMonthKey(monthKey: string) {
  const base = dayjs.utc(`${monthKey}-01`, 'YYYY-MM-DD', true)
  return {
    start: base.format('YYYY-MM-DD'),
    end: base.endOf('month').format('YYYY-MM-DD')
  }
}

export function resolveCalendarPanelDate(
  currentSelectedDate: string,
  targetMonthKey: string,
  timezoneValue = DEFAULT_APP_TIMEZONE,
  now: Date | string = new Date()
) {
  const today = currentBusinessDateString(timezoneValue, now)
  if (today.slice(0, 7) === targetMonthKey) {
    return today
  }

  const currentSelectedDay = Number(currentSelectedDate.slice(8, 10))
  const clampedDay = Math.min(currentSelectedDay, daysInMonthFromMonthKey(targetMonthKey))
  return `${targetMonthKey}-${String(clampedDay).padStart(2, '0')}`
}

export function addIntervalToPickerTs(
  timestamp: number,
  count: number,
  unit: 'day' | 'week' | 'month' | 'quarter' | 'year'
) {
  const base = dayjs(timestamp)
  switch (unit) {
    case 'day':
      return base.add(count, 'day').valueOf()
    case 'week':
      return base.add(count, 'week').valueOf()
    case 'month':
      return base.add(count, 'month').valueOf()
    case 'quarter':
      return base.add(count * 3, 'month').valueOf()
    case 'year':
      return base.add(count, 'year').valueOf()
    default:
      return base.valueOf()
  }
}

export function formatMonthLabelInTimezone(value: Date | string | number, timezoneValue = DEFAULT_APP_TIMEZONE) {
  return toTimezonedDayjs(typeof value === 'number' ? new Date(value) : value, timezoneValue).format('YYYY 年 M 月')
}

export function addIntervalToBusinessDateString(
  dateString: string,
  count: number,
  unit: 'day' | 'week' | 'month' | 'quarter' | 'year'
) {
  const base = dayjs.utc(dateString, 'YYYY-MM-DD', true)
  switch (unit) {
    case 'day':
      return base.add(count, 'day').format('YYYY-MM-DD')
    case 'week':
      return base.add(count, 'week').format('YYYY-MM-DD')
    case 'month':
      return base.add(count, 'month').format('YYYY-MM-DD')
    case 'quarter':
      return base.add(count * 3, 'month').format('YYYY-MM-DD')
    case 'year':
      return base.add(count, 'year').format('YYYY-MM-DD')
    default:
      return base.format('YYYY-MM-DD')
  }
}
