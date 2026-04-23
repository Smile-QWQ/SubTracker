import { useQuery } from '@tanstack/vue-query'
import { api } from '@/composables/api'

export const NOTIFICATION_WEBHOOK_QUERY_KEY = ['notification-webhook'] as const

export function useNotificationWebhookQuery() {
  return useQuery({
    queryKey: NOTIFICATION_WEBHOOK_QUERY_KEY,
    queryFn: api.getNotificationWebhook,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  })
}
