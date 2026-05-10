import { describe, expect, it } from 'vitest'
import { calculateSubscriptionRemainingValue } from '../../src/services/subscription-value.service'

describe('subscription remaining value', () => {
  const timezone = 'Asia/Shanghai'

  it('uses aligned payment record when available', () => {
    const result = calculateSubscriptionRemainingValue(
      {
        amount: 30,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-06-01T00:00:00.000Z')
      },
      [
        {
          amount: 30,
          currency: 'USD',
          periodStart: new Date('2026-05-01T00:00:00.000Z'),
          periodEnd: new Date('2026-06-01T00:00:00.000Z'),
          paidAt: new Date('2026-05-01T01:00:00.000Z')
        }
      ],
      new Date('2026-05-16T00:00:00.000Z'),
      timezone,
      {
        baseCurrency: 'CNY',
        exchangeRatesBaseCurrency: 'CNY',
        exchangeRates: {
          CNY: 1,
          USD: 0.14
        }
      }
    )

    expect(result.currentCycleStartDate).toBe('2026-05-01')
    expect(result.currentCycleEndDate).toBe('2026-06-01')
    expect(result.remainingValueCurrency).toBe('CNY')
    expect(result.remainingDays).toBeGreaterThan(0)
    expect(result.remainingValue).toBeGreaterThan(0)
  })

  it('falls back to derived cycle start when payment record is missing', () => {
    const result = calculateSubscriptionRemainingValue(
      {
        amount: 12,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        startDate: new Date('2026-05-10T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-06-20T00:00:00.000Z')
      },
      [],
      new Date('2026-05-20T00:00:00.000Z'),
      timezone
    )

    expect(result.currentCycleStartDate).toBe('2026-05-20')
    expect(result.remainingValue).toBeGreaterThan(0)
  })

  it('returns zero for overdue subscriptions', () => {
    const result = calculateSubscriptionRemainingValue(
      {
        amount: 50,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-04-01T00:00:00.000Z')
      },
      [],
      new Date('2026-04-02T12:00:00.000Z'),
      timezone
    )

    expect(result.remainingDays).toBe(0)
    expect(result.remainingRatio).toBe(0)
    expect(result.remainingValue).toBe(0)
  })
})
