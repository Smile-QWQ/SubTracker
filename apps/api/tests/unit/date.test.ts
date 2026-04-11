import { describe, expect, it } from 'vitest'
import { addInterval, isOverdue, isReminderDue, toIsoDate } from '../../src/utils/date'

describe('date utils', () => {
  it('should add month interval correctly', () => {
    const next = addInterval('2026-04-10', 1, 'month')
    expect(toIsoDate(next)).toBe('2026-05-10')
  })

  it('should detect reminder due', () => {
    const today = new Date('2026-04-07')
    const renewal = new Date('2026-04-10')
    expect(isReminderDue(today, renewal, 3)).toBe(true)
  })

  it('should detect overdue', () => {
    const today = new Date('2026-04-12')
    const renewal = new Date('2026-04-10')
    expect(isOverdue(today, renewal)).toBe(true)
  })
})
