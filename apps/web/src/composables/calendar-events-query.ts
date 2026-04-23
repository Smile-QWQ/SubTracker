import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

type CalendarRange = {
  start?: string
  end?: string
}

export function useCalendarEventsQuery(params: MaybeRefOrGetter<CalendarRange>) {
  const normalizedParams = computed(() => toValue(params))

  return useQuery({
    queryKey: computed(() => ['calendar-events', normalizedParams.value]),
    queryFn: () => api.getCalendarEvents(normalizedParams.value),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData
  })
}
