import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const BUDGET_STATISTICS_QUERY_KEY = ['statistics-budgets'] as const

export function useBudgetStatisticsQuery() {
  return useQuery({
    queryKey: BUDGET_STATISTICS_QUERY_KEY,
    queryFn: api.getBudgetStatistics,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
