export function swapCurrencyPair(pair: { sourceCurrency: string; targetCurrency: string }) {
  return {
    sourceCurrency: pair.targetCurrency,
    targetCurrency: pair.sourceCurrency
  }
}
