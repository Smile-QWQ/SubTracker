import currencyNameMap from '@/data/currency-names.zh-CN.json'
import { getAppLocale } from '@/locales'

export function getCurrencyLabel(code: string) {
  const upper = code.toUpperCase()
  if (getAppLocale() === 'en-US' && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    const displayNames = new Intl.DisplayNames(['en-US'], { type: 'currency' })
    const englishName = displayNames.of(upper)
    return englishName ? `${englishName} (${upper})` : upper
  }

  const name = (currencyNameMap as Record<string, string>)[upper]
  return name ? `${name} (${upper})` : upper
}

export function buildCurrencyOptions(currencies: string[]) {
  return currencies.map((currency) => ({
    label: getCurrencyLabel(currency),
    value: currency
  }))
}
