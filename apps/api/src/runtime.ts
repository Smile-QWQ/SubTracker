import { AsyncLocalStorage } from 'node:async_hooks'
import type { PrismaClient } from '@prisma/client'
import type { D1Database, Fetcher, KVNamespace, R2Bucket } from './worker/types'

export interface WorkerBindings {
  DB: D1Database
  ASSETS?: Fetcher
  SUBTRACKER_CACHE?: KVNamespace
  SUBTRACKER_LOGOS?: R2Bucket
  WEB_ORIGIN?: string
  BASE_CURRENCY?: string
  DEFAULT_NOTIFY_DAYS?: string
  EXCHANGE_RATE_PROVIDER?: string
  EXCHANGE_RATE_URL?: string
  CRON_SCAN?: string
  CRON_REFRESH_RATES?: string
  RESEND_API_URL?: string
}

type RuntimeContext = {
  prisma: PrismaClient
  bindings: WorkerBindings
  request?: Request
}

const runtimeStorage = new AsyncLocalStorage<RuntimeContext>()

function requireRuntimeContext() {
  const context = runtimeStorage.getStore()
  if (!context) {
    throw new Error('Runtime context unavailable')
  }
  return context
}

export function runWithRuntimeContext<T>(context: RuntimeContext, fn: () => T) {
  return runtimeStorage.run(context, fn)
}

export function getRuntimeBindings() {
  return requireRuntimeContext().bindings
}

export function getRuntimeRequest() {
  return requireRuntimeContext().request
}

export function getRuntimePrisma() {
  return requireRuntimeContext().prisma
}

function getBindingOrEnv(key: keyof WorkerBindings, fallback: string) {
  try {
    const bindings = getRuntimeBindings()
    const value = bindings[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  } catch {
    // ignore and fall back to process env
  }

  const envValue = process.env[String(key)]
  if (envValue && envValue.trim()) {
    return envValue
  }

  return fallback
}

export function getWorkerCache() {
  try {
    return getRuntimeBindings().SUBTRACKER_CACHE
  } catch {
    return undefined
  }
}

export function getWorkerLogoBucket() {
  try {
    return getRuntimeBindings().SUBTRACKER_LOGOS
  } catch {
    return undefined
  }
}

export function isWorkerRuntime() {
  try {
    getRuntimeBindings()
    return true
  } catch {
    return false
  }
}

export function getWorkerPublicConfig() {
  let resendApiUrl = process.env.RESEND_API_URL?.trim()

  try {
    const bindings = getRuntimeBindings()
    resendApiUrl = bindings.RESEND_API_URL?.trim() || resendApiUrl
  } catch {
    // ignore runtime binding lookup outside Worker context
  }

  resendApiUrl ||= 'https://api.resend.com/emails'

  return {
    webOrigin: getBindingOrEnv('WEB_ORIGIN', 'http://localhost:5173'),
    baseCurrency: getBindingOrEnv('BASE_CURRENCY', 'CNY').toUpperCase(),
    defaultNotifyDays: Number(getBindingOrEnv('DEFAULT_NOTIFY_DAYS', '3')),
    exchangeRateProvider: getBindingOrEnv('EXCHANGE_RATE_PROVIDER', 'er-api'),
    exchangeRateUrl: getBindingOrEnv('EXCHANGE_RATE_URL', 'https://open.er-api.com/v6/latest'),
    cronScan: getBindingOrEnv('CRON_SCAN', '* * * * *'),
    cronRefreshRates: getBindingOrEnv('CRON_REFRESH_RATES', '0 2 * * *'),
    resendApiUrl
  }
}
