import { describe, expect, it } from 'vitest'
import {
  CreateSubscriptionSchema,
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  SettingsSchema
} from '../src/index'

describe('shared schema', () => {
  it('should validate create subscription payload', () => {
    const parsed = CreateSubscriptionSchema.parse({
      name: 'GitHub',
      amount: 10,
      currency: 'usd',
      billingIntervalUnit: 'month',
      startDate: '2026-04-01',
      nextRenewalDate: '2026-05-01'
    })

    expect(parsed.currency).toBe('USD')
    expect(parsed.billingIntervalCount).toBe(1)
    expect(parsed.advanceReminderRules).toBeUndefined()
  })

  it('should provide reminder-related setting defaults', () => {
    const parsed = SettingsSchema.parse({})

    expect(parsed.defaultNotifyDays).toBe(3)
    expect(parsed.defaultAdvanceReminderRules).toBe(DEFAULT_ADVANCE_REMINDER_RULES)
    expect(parsed.notifyOnDueDay).toBe(true)
    expect(parsed.mergeMultiSubscriptionNotifications).toBe(true)
    expect(parsed.overdueReminderDays).toEqual([1, 2, 3])
    expect(parsed.defaultOverdueReminderRules).toBe(DEFAULT_OVERDUE_REMINDER_RULES)
    expect(parsed.telegramNotificationsEnabled).toBe(false)
    expect(parsed.telegramConfig).toEqual({
      botToken: '',
      chatId: ''
    })
  })
})
