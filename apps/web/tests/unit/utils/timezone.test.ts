import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_TIMEZONE,
  buildTimeZoneOptions,
  businessDateToPickerTs,
  currentBusinessDatePickerTs,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  normalizeAppTimezone,
  pickerTsToDateString,
  resolveCalendarPanelDate
} from '@/utils/timezone'

describe('timezone utils', () => {
  it('normalizes timezones and exposes full options', () => {
    expect(normalizeAppTimezone('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(normalizeAppTimezone('Mars/Olympus')).toBe(DEFAULT_APP_TIMEZONE)

    const options = buildTimeZoneOptions()
    expect(options[0]?.value).toBe('UTC')
    expect(options.some((item) => item.value === 'Asia/Shanghai')).toBe(true)
    expect(options.some((item) => item.value === 'America/Los_Angeles')).toBe(true)
  })

  it('formats dates and datetimes in the configured timezone', () => {
    const source = '2026-04-24T16:00:00.000Z'
    expect(formatDateInTimezone(source, 'Asia/Shanghai')).toBe('2026-04-25')
    expect(formatDateInTimezone(source, 'UTC')).toBe('2026-04-24')
    expect(formatDateTimeInTimezone(source, 'Asia/Shanghai')).toBe('2026-04-25 00:00:00')
  })

  it('converts business dates to picker timestamps and back', () => {
    const ts = businessDateToPickerTs('2026-04-25T16:00:00.000Z', 'Asia/Shanghai')
    expect(pickerTsToDateString(ts)).toBe('2026-04-26')
  })

  it('builds current picker timestamps from business timezone today', () => {
    const ts = currentBusinessDatePickerTs('Asia/Shanghai', '2026-04-24T16:30:00.000Z')
    expect(pickerTsToDateString(ts)).toBe('2026-04-25')
  })

  it('prefers business timezone today when switching calendar panel to the current month', () => {
    expect(resolveCalendarPanelDate('2026-03-08', '2026-04', 'Asia/Shanghai', '2026-04-24T16:30:00.000Z')).toBe(
      '2026-04-25'
    )
  })

  it('preserves the selected day when switching to non-current months', () => {
    expect(resolveCalendarPanelDate('2026-03-31', '2026-02', 'Asia/Shanghai', '2026-04-24T16:30:00.000Z')).toBe(
      '2026-02-28'
    )
  })
})
