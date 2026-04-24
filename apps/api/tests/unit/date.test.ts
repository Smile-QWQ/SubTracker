import { describe, expect, it } from 'vitest'
import { addInterval, isOverdue, isReminderDue, toIsoDate } from '../../src/utils/date'

describe('date utils', () => {
  it('should add month interval correctly', () => {
    const next = addInterval('2026-04-10', 1, 'month', 'Asia/Shanghai')
    expect(toIsoDate(next)).toBe('2026-05-10')
  })

  it('should detect reminder due in configured timezone', () => {
    const today = new Date('2026-04-06T16:00:00.000Z')
    const renewal = new Date('2026-04-09T16:00:00.000Z')
    expect(isReminderDue(today, renewal, 3, 'Asia/Shanghai')).toBe(true)
  })

  it('should detect overdue by configured timezone day boundary', () => {
    const today = new Date('2026-04-11T16:00:00.000Z')
    const renewal = new Date('2026-04-09T16:00:00.000Z')
    expect(isOverdue(today, renewal, 'Asia/Shanghai')).toBe(true)
  })
})
