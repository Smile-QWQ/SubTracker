import { describe, expect, it } from 'vitest'
import { buildTopSubscriptionsOption } from '../../../src/utils/statistics-top-subscriptions'

describe('buildTopSubscriptionsOption', () => {
  it('returns null when there is no data', () => {
    expect(buildTopSubscriptionsOption([], 'CNY')).toBeNull()
  })

  it('builds a horizontal bar chart option from top subscription data', () => {
    const option = buildTopSubscriptionsOption(
      [
        {
          id: 'a',
          name: 'Netflix',
          amount: 120,
          currency: 'USD',
          monthlyAmountBase: 88,
          baseCurrency: 'CNY'
        }
      ],
      'CNY'
    )

    expect(option?.yAxis.data).toEqual(['Netflix'])
    expect(option?.yAxis.inverse).toBe(true)
    expect(option?.series[0].data).toEqual([88])
  })

  it('limits the chart to the first 10 items', () => {
    const option = buildTopSubscriptionsOption(
      Array.from({ length: 12 }, (_, index) => ({
        id: `${index + 1}`,
        name: `Subscription ${index + 1}`,
        amount: index + 1,
        currency: 'CNY',
        monthlyAmountBase: index + 1,
        baseCurrency: 'CNY'
      })),
      'CNY'
    )

    expect(option?.yAxis.data).toHaveLength(10)
    expect(option?.series[0].data).toHaveLength(10)
  })
})
