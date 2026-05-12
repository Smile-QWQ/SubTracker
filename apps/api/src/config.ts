import { getWorkerPublicConfig } from './runtime'

export const config = new Proxy(
  {},
  {
    get(_target, property: string) {
      const runtimeConfig = getWorkerPublicConfig()

      const baseConfig = {
        port: Number(process.env.PORT ?? 3001),
        host: process.env.HOST ?? '0.0.0.0',
        appVersion: runtimeConfig.appVersion,
        webOrigin: runtimeConfig.webOrigin,
        baseCurrency: runtimeConfig.baseCurrency,
        defaultNotifyDays: runtimeConfig.defaultNotifyDays,
        exchangeRateProvider: runtimeConfig.exchangeRateProvider,
        exchangeRateUrl: runtimeConfig.exchangeRateUrl,
        cronScan: runtimeConfig.cronScan,
        cronRefreshRates: runtimeConfig.cronRefreshRates,
        resendApiUrl: runtimeConfig.resendApiUrl
      } as const

      return baseConfig[property as keyof typeof baseConfig]
    }
  }
) as {
  port: number
  host: string
  appVersion: string
  webOrigin: string
  baseCurrency: string
  defaultNotifyDays: number
  exchangeRateProvider: string
  exchangeRateUrl: string
  cronScan: string
  cronRefreshRates: string
  resendApiUrl: string
}
