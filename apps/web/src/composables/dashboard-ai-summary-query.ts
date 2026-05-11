import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'
import { useAppLocale } from '@/locales'

export const DASHBOARD_AI_SUMMARY_QUERY_KEY = ['dashboard-ai-summary'] as const

export function useDashboardAiSummaryQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  const { locale } = useAppLocale()

  return useQuery({
    queryKey: computed(() => [...DASHBOARD_AI_SUMMARY_QUERY_KEY, locale.value] as const),
    queryFn: api.getDashboardAiSummary,
    enabled: computed(() => toValue(enabled)),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
