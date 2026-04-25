import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_TIMEZONE,
  buildSupportedTimezones,
  endOfDayDateInTimezone,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  getNowInTimezone,
  normalizeAppTimezone,
  parseDateInTimezone,
  startOfDayDateInTimezone
} from '../../src/utils/timezone'

describe('timezone utils', () => {
  it('normalizes invalid timezones and keeps valid ones', () => {
    expect(normalizeAppTimezone('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(normalizeAppTimezone('Mars/Olympus')).toBe(DEFAULT_APP_TIMEZONE)
    expect(normalizeAppTimezone('UTC')).toBe('UTC')
  })

  it('formats date-only and date-time values in the configured timezone', () => {
    const source = new Date('2026-04-24T16:00:00.000Z')

    expect(formatDateInTimezone(source, 'Asia/Shanghai')).toBe('2026-04-25')
    expect(formatDateInTimezone(source, 'UTC')).toBe('2026-04-24')
    expect(formatDateTimeInTimezone(source, 'Asia/Shanghai')).toBe('2026-04-25 00:00:00')
  })

  it('parses business dates into timezone-aware utc dates', () => {
    expect(parseDateInTimezone('2026-04-25', 'Asia/Shanghai').toISOString()).toBe('2026-04-24T16:00:00.000Z')
    expect(parseDateInTimezone('2026-04-25', 'UTC').toISOString()).toBe('2026-04-25T00:00:00.000Z')
  })

  it('builds day boundaries and current time in the configured timezone', () => {
    expect(startOfDayDateInTimezone('2026-04-25T15:00:00.000Z', 'Asia/Shanghai').toISOString()).toBe(
      '2026-04-24T16:00:00.000Z'
    )
    expect(endOfDayDateInTimezone('2026-04-25T15:00:00.000Z', 'Asia/Shanghai').toISOString()).toBe(
      '2026-04-25T15:59:59.999Z'
    )
    expect(getNowInTimezone('2026-04-24T16:30:00.000Z', 'Asia/Shanghai').format('YYYY-MM-DD HH:mm')).toBe(
      '2026-04-25 00:30'
    )
  })

  it('returns a full timezone list with UTC included', () => {
    const list = buildSupportedTimezones()
    expect(list[0]).toBe('UTC')
    expect(list).toContain('Asia/Shanghai')
    expect(list).toContain('America/Los_Angeles')
  })
})
