import currencyNameMap from '@/data/currency-names.zh-CN.json'

export function getCurrencyLabel(code: string) {
  const upper = code.toUpperCase()
  const name = (currencyNameMap as Record<string, string>)[upper]
  return name ? `${name} (${upper})` : upper
}

export function buildCurrencyOptions(currencies: string[]) {
  return currencies.map((currency) => ({
    label: getCurrencyLabel(currency),
    value: currency
  }))
}
