export function roundMoney(value: number): number {
  return Number(value.toFixed(2))
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  baseCurrency: string,
  rates: Record<string, number>
): number {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  const base = baseCurrency.toUpperCase()

  if (from === to) return roundMoney(amount)

  const normalizedRates: Record<string, number> = {
    ...rates,
    [base]: 1
  }

  const fromRate = normalizedRates[from]
  const toRate = normalizedRates[to]

  if (!fromRate || !toRate) {
    throw new Error(`Unsupported currency conversion: ${from} -> ${to}`)
  }

  const inBase = amount / fromRate
  const converted = inBase * toRate
  return roundMoney(converted)
}
