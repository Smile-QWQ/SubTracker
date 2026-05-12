import { describe, expect, it } from 'vitest'
import { formatNotificationDate } from '../../src/services/notification-presentation.service'

describe('formatNotificationDate', () => {
  it('formats ISO date strings to date-only output', () => {
    expect(formatNotificationDate('2026-04-24T16:00:00.000Z')).toBe('2026-04-24')
  })

  it('falls back to the original value when parsing fails', () => {
    expect(formatNotificationDate('not-a-date')).toBe('not-a-date')
  })
})
