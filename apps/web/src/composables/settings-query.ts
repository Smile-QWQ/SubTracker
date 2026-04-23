import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const SETTINGS_QUERY_KEY = ['settings'] as const

export function useSettingsQuery() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: api.getSettings,
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
