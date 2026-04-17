import { describe, expect, it } from 'vitest'
import { resolveReminderPhase } from '../../src/services/notification.service'

describe('resolveReminderPhase', () => {
  it('returns upcoming on notify day', () => {
    expect(resolveReminderPhase(new Date('2026-04-20'), new Date('2026-04-23'), 3)).toEqual({
      eventType: 'subscription.reminder_due',
      phase: 'upcoming'
    })
  })

  it('returns due_today on renewal date', () => {
    expect(resolveReminderPhase(new Date('2026-04-23'), new Date('2026-04-23'), 3)).toEqual({
      eventType: 'subscription.reminder_due',
      phase: 'due_today'
    })
  })

  it('returns overdue phases for first three overdue days only', () => {
    expect(resolveReminderPhase(new Date('2026-04-24'), new Date('2026-04-23'), 3)).toEqual({
      eventType: 'subscription.overdue',
      phase: 'overdue_day_1'
    })
    expect(resolveReminderPhase(new Date('2026-04-25'), new Date('2026-04-23'), 3)).toEqual({
      eventType: 'subscription.overdue',
      phase: 'overdue_day_2'
    })
    expect(resolveReminderPhase(new Date('2026-04-26'), new Date('2026-04-23'), 3)).toEqual({
      eventType: 'subscription.overdue',
      phase: 'overdue_day_3'
    })
    expect(resolveReminderPhase(new Date('2026-04-27'), new Date('2026-04-23'), 3)).toBeNull()
  })
})
