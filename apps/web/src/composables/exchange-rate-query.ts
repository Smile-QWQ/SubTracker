import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const EXCHANGE_RATE_SNAPSHOT_QUERY_KEY = ['exchange-rate-snapshot'] as const

export function useExchangeRateSnapshotQuery() {
  return useQuery({
    queryKey: EXCHANGE_RATE_SNAPSHOT_QUERY_KEY,
    queryFn: api.getExchangeRateSnapshot,
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
