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

  it('can disable due_today reminder', () => {
    expect(
      resolveReminderPhase(new Date('2026-04-23'), new Date('2026-04-23'), 3, {
        notifyOnDueDay: false,
        overdueReminderDays: [1, 2, 3]
      })
    ).toBeNull()
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

  it('only returns configured overdue reminder days', () => {
    expect(
      resolveReminderPhase(new Date('2026-04-24'), new Date('2026-04-23'), 3, {
        notifyOnDueDay: true,
        overdueReminderDays: [2, 3]
      })
    ).toBeNull()

    expect(
      resolveReminderPhase(new Date('2026-04-25'), new Date('2026-04-23'), 3, {
        notifyOnDueDay: true,
        overdueReminderDays: [2, 3]
      })
    ).toEqual({
      eventType: 'subscription.overdue',
      phase: 'overdue_day_2'
    })
  })

  it('does not treat notifyDaysBefore = 0 as an upcoming reminder on due date', () => {
    expect(
      resolveReminderPhase(new Date('2026-04-23'), new Date('2026-04-23'), 0, {
        notifyOnDueDay: false,
        overdueReminderDays: [1, 2, 3]
      })
    ).toBeNull()
  })
})
