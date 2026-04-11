import dayjs from 'dayjs'
import type { BillingIntervalUnit } from '@subtracker/shared'

export function toIsoDate(date: Date | string): string {
  return dayjs(date).format('YYYY-MM-DD')
}

export function toDate(date: Date | string): Date {
  return dayjs(date).startOf('day').toDate()
}

export function addInterval(date: Date | string, count: number, unit: BillingIntervalUnit): Date {
  const d = dayjs(date)
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

export function isReminderDue(today: Date, nextRenewalDate: Date, notifyDaysBefore: number): boolean {
  const reminderDate = dayjs(nextRenewalDate).subtract(notifyDaysBefore, 'day').startOf('day')
  return dayjs(today).isSame(reminderDate) || dayjs(today).isAfter(reminderDate)
}

export function isOverdue(today: Date, nextRenewalDate: Date): boolean {
  return dayjs(today).isAfter(dayjs(nextRenewalDate).endOf('day'))
}

export function monthKey(date: Date | string): string {
  return dayjs(date).format('YYYY-MM')
}
