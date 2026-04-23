import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const STATISTICS_OVERVIEW_QUERY_KEY = ['statistics-overview'] as const

export function useStatisticsOverviewQuery() {
  return useQuery({
    queryKey: STATISTICS_OVERVIEW_QUERY_KEY,
    queryFn: api.getStatisticsOverview,
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
