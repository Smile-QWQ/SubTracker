import { describe, expect, it } from 'vitest'
import { getMessage } from '@subtracker/shared'
import { convertAmount } from '../../src/utils/money'

describe('money utils', () => {
  it('should convert USD to CNY with base USD rates', () => {
    const result = convertAmount(10, 'USD', 'CNY', 'USD', { CNY: 7.2, EUR: 0.92 })
    expect(result).toBe(72)
  })

  it('should convert EUR to CNY with base USD rates', () => {
    const result = convertAmount(10, 'EUR', 'CNY', 'USD', { CNY: 7.2, EUR: 0.9 })
    expect(result).toBe(80)
  })

  it('should throw a localized error when rates are missing', () => {
    expect(() => convertAmount(10, 'USD', 'JPY', 'USD', { CNY: 7.2, EUR: 0.9 })).toThrow(
      getMessage('zh-CN', 'api.errors.exchangeRates.unsupportedCurrencyConversion', { from: 'USD', to: 'JPY' })
    )
  })
})
