import { describe, expect, it } from 'vitest'
import { calculateSubscriptionRemainingValue } from '../../src/services/subscription-value.service'

describe('subscription value service', () => {
  it('calculates remaining cycle value from billing cycle fallback', () => {
    const result = calculateSubscriptionRemainingValue(
      {
        amount: 30,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-06-01T00:00:00.000Z')
      },
      [],
      new Date('2026-05-16T00:00:00.000Z'),
      'Asia/Shanghai',
      {
        baseCurrency: 'CNY',
        exchangeRatesBaseCurrency: 'CNY',
        exchangeRates: {
          USD: 7.2,
          CNY: 1
        }
      }
    )

    expect(result.currentCycleStartDate).toBeTruthy()
    expect(result.currentCycleEndDate).toBe('2026-06-01')
    expect(result.remainingDays).toBeGreaterThan(0)
    expect(result.remainingValueCurrency).toBe('CNY')
  })
})
