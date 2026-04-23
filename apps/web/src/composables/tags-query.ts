import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const TAGS_QUERY_KEY = ['tags'] as const

export function useTagsQuery() {
  return useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: api.getTags,
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
