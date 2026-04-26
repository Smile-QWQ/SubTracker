import dayjs from 'dayjs'
import { prisma } from '../db'
import { config } from '../config'
import { convertAmount } from '../utils/money'
import { bumpCacheVersions, getCacheVersion } from './cache-version.service'
import { getSetting } from './settings.service'
import { getExchangeRateSnapshotLite } from './worker-lite-repository.service'
import { withWorkerLiteCache } from './worker-lite-cache.service'
import type { ExchangeRateSnapshotDto } from '@subtracker/shared'

type ProviderResponse = {
  result?: string
  base_code?: string
  base?: string
  time_last_update_utc?: string
  rates: Record<string, number>
}

const EXCHANGE_RATE_CACHE_TTL_SECONDS = 30

export async function getBaseCurrency(): Promise<string> {
  const baseCurrency = await getSetting('baseCurrency', config.baseCurrency)
  return String(baseCurrency).toUpperCase()
}

export async function getLatestSnapshot(baseCurrency?: string): Promise<ExchangeRateSnapshotDto> {
  const base = (baseCurrency ?? (await getBaseCurrency())).toUpperCase()
  let snapshot = await getExchangeRateSnapshotLite(base)

  if (!snapshot) {
    snapshot = await refreshExchangeRates(base)
  }

  return {
    baseCurrency: snapshot.baseCurrency,
    rates: snapshot.ratesJson as Record<string, number>,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    provider: snapshot.provider,
    providerUrl: config.exchangeRateUrl,
    isStale: snapshot.isStale
  }
}

export async function refreshExchangeRates(baseCurrency?: string) {
  const base = (baseCurrency ?? (await getBaseCurrency())).toUpperCase()

  try {
    const response = await fetch(`${config.exchangeRateUrl}/${base}`)
    if (!response.ok) {
      throw new Error(`Rate provider failed with status ${response.status}`)
    }

    const payload = (await response.json()) as ProviderResponse
    const rates = payload.rates ?? {}

    if (!Object.keys(rates).length) {
      throw new Error('Rate payload is empty')
    }

    const snapshot = await prisma.exchangeRateSnapshot.upsert({
      where: { baseCurrency: base },
      update: {
        ratesJson: rates,
        provider: config.exchangeRateProvider,
        fetchedAt: new Date(),
        isStale: false
      },
      create: {
        baseCurrency: base,
        ratesJson: rates,
        provider: config.exchangeRateProvider,
        fetchedAt: new Date(),
        isStale: false
      }
    })

    await bumpCacheVersions(['statistics', 'calendar', 'exchangeRates'])
    return snapshot
  } catch (error) {
    const existing = await getExchangeRateSnapshotLite(base)
    if (existing) {
      return prisma.exchangeRateSnapshot.update({
        where: { baseCurrency: base },
        data: {
          isStale: true
        }
      })
    }

    throw error
  }
}

export async function ensureExchangeRates(baseCurrency?: string): Promise<ExchangeRateSnapshotDto> {
  const base = (baseCurrency ?? (await getBaseCurrency())).toUpperCase()
  const version = await getCacheVersion('exchangeRates')

  return withWorkerLiteCache(
    'exchange-rates',
    `snapshot:${base}:v${version}`,
    async () => {
      const existing = await getExchangeRateSnapshotLite(base)

      if (!existing) {
        return getLatestSnapshot(base)
      }

      const shouldRefresh = dayjs().diff(dayjs(existing.fetchedAt), 'hour') >= 24

      if (shouldRefresh) {
        await refreshExchangeRates(base)
      }

      return getLatestSnapshot(base)
    },
    EXCHANGE_RATE_CACHE_TTL_SECONDS
  )
}

export async function convertToBase(amount: number, sourceCurrency: string): Promise<number> {
  const snapshot = await ensureExchangeRates()
  return convertAmount(amount, sourceCurrency, snapshot.baseCurrency, snapshot.baseCurrency, snapshot.rates)
}
