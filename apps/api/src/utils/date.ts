import type { BillingIntervalUnit } from '@subtracker/shared'
import { formatDateInTimezone, startOfDayDateInTimezone, toTimezonedDayjs } from './timezone'

export function toIsoDate(date: Date | string, timezone = 'Asia/Shanghai'): string {
  return formatDateInTimezone(date, timezone)
}

export function toDate(date: Date | string, timezone = 'Asia/Shanghai'): Date {
  return startOfDayDateInTimezone(date, timezone)
}

export function addInterval(date: Date | string, count: number, unit: BillingIntervalUnit, timezone = 'Asia/Shanghai'): Date {
  const d = toTimezonedDayjs(date, timezone)
  switch (unit) {
    case 'day':
      return d.add(count, 'day').toDate()
    case 'week':
      return d.add(count, 'week').toDate()
    case 'month':
      return d.add(count, 'month').toDate()
    case 'quarter':
      return d.add(count * 3, 'month').toDate()
    case 'year':
      return d.add(count, 'year').toDate()
    default:
      return d.toDate()
  }
}

export function isReminderDue(today: Date, nextRenewalDate: Date, notifyDaysBefore: number, timezone = 'Asia/Shanghai'): boolean {
  const reminderDate = toTimezonedDayjs(nextRenewalDate, timezone).subtract(notifyDaysBefore, 'day').startOf('day')
  const now = toTimezonedDayjs(today, timezone)
  return now.isSame(reminderDate) || now.isAfter(reminderDate)
}

export function isOverdue(today: Date, nextRenewalDate: Date, timezone = 'Asia/Shanghai'): boolean {
  return toTimezonedDayjs(today, timezone).isAfter(toTimezonedDayjs(nextRenewalDate, timezone).endOf('day'))
}

export function monthKey(date: Date | string, timezone = 'Asia/Shanghai'): string {
  return toTimezonedDayjs(date, timezone).format('YYYY-MM')
}
