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
    expect(result.remainingDays).toBe(16)
    expect(result.remainingRatio).toBe(0.5)
    expect(result.remainingValue).toBe(107.14)
    expect(result.remainingValueCurrency).toBe('CNY')
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
    expect(result.currentCycleEndDate).toBe('2026-06-20')
    expect(result.remainingDays).toBe(31)
    expect(result.remainingRatio).toBe(0.9688)
    expect(result.remainingValue).toBe(11.63)
  })

  it('does not let future prepaid cycles inflate the current-cycle ratio', () => {
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
        },
        {
          amount: 30,
          currency: 'USD',
          periodStart: new Date('2026-06-01T00:00:00.000Z'),
          periodEnd: new Date('2026-07-01T00:00:00.000Z'),
          paidAt: new Date('2026-05-20T01:00:00.000Z')
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
    expect(result.remainingDays).toBe(16)
    expect(result.remainingRatio).toBe(0.5)
    expect(result.remainingValueCurrency).toBe('CNY')
    expect(result.remainingValue).toBe(107.14)
  })

  it('allows remaining ratio to exceed 100% when the current cycle has gifted extra days', () => {
    const result = calculateSubscriptionRemainingValue(
      {
        amount: 14,
        currency: 'EUR',
        billingIntervalCount: 1,
        billingIntervalUnit: 'quarter',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-08-14T00:00:00.000Z')
      },
      [
        {
          amount: 14,
          currency: 'EUR',
          periodStart: new Date('2026-05-04T00:00:00.000Z'),
          periodEnd: new Date('2026-08-14T00:00:00.000Z'),
          paidAt: new Date('2026-05-04T01:00:00.000Z')
        }
      ],
      new Date('2026-05-04T00:00:00.000Z'),
      timezone,
      {
        baseCurrency: 'CNY',
        exchangeRatesBaseCurrency: 'CNY',
        exchangeRates: {
          CNY: 1,
          EUR: 0.08
        }
      }
    )

    expect(result.currentCycleStartDate).toBe('2026-05-04')
    expect(result.currentCycleEndDate).toBe('2026-08-14')
    expect(result.remainingDays).toBe(102)
    expect(result.remainingRatio).toBe(1.0968)
    expect(result.remainingValueCurrency).toBe('CNY')
    expect(result.remainingValue).toBe(192)
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

  it('always excludes today in business timezone regardless of the current hour', () => {
    const beforeEightAm = calculateSubscriptionRemainingValue(
      {
        amount: 30,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-06-01T00:00:00.000Z')
      },
      [],
      new Date('2026-05-15T23:59:59.000Z'),
      timezone
    )

    const afterEightAm = calculateSubscriptionRemainingValue(
      {
        amount: 30,
        currency: 'CNY',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-06-01T00:00:00.000Z')
      },
      [],
      new Date('2026-05-16T00:00:00.000Z'),
      timezone
    )

    expect(beforeEightAm.remainingDays).toBe(16)
    expect(beforeEightAm.remainingRatio).toBe(0.5)
    expect(afterEightAm.remainingDays).toBe(16)
    expect(afterEightAm.remainingRatio).toBe(0.5)
  })
})
