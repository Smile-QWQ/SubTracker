import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const VERSION_UPDATE_QUERY_KEY = ['version-updates'] as const

export function useVersionUpdateQuery(currentVersion: string) {
  return useQuery({
    queryKey: [...VERSION_UPDATE_QUERY_KEY, currentVersion],
    queryFn: () => api.getVersionUpdates(currentVersion),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    enabled: Boolean(currentVersion)
  })
}
