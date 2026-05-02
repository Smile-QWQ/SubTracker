import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const DASHBOARD_AI_SUMMARY_QUERY_KEY = ['dashboard-ai-summary'] as const

export function useDashboardAiSummaryQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: DASHBOARD_AI_SUMMARY_QUERY_KEY,
    queryFn: api.getDashboardAiSummary,
    enabled: computed(() => toValue(enabled)),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
