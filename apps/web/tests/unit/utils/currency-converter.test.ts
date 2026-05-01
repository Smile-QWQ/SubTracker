import { describe, expect, it } from 'vitest'
import { swapCurrencyPair } from '@/utils/currency-converter'

describe('currency converter utils', () => {
  it('swaps source and target currencies', () => {
    expect(
      swapCurrencyPair({
        sourceCurrency: 'USD',
        targetCurrency: 'CNY'
      })
    ).toEqual({
      sourceCurrency: 'CNY',
      targetCurrency: 'USD'
    })
  })
})
