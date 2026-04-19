import { describe, expect, it } from 'vitest'
import { CreateSubscriptionSchema, SettingsSchema } from '../src/index'

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
  })

  it('should provide reminder-related setting defaults', () => {
    const parsed = SettingsSchema.parse({})

    expect(parsed.defaultNotifyDays).toBe(3)
    expect(parsed.notifyOnDueDay).toBe(true)
    expect(parsed.overdueReminderDays).toEqual([1, 2, 3])
  })
})
