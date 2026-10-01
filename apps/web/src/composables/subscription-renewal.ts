import { ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { useLocalizedMessage } from '@/utils/localized-message'

export function useSubscriptionRenewal() {
  const queryClient = useQueryClient()
  const message = useLocalizedMessage()
  const renewingIds = ref(new Set<string>())

  async function renew(id: string, name: string) {
    if (renewingIds.value.has(id)) return
    renewingIds.value.add(id)
    try {
      await api.renewSubscription(id)
      message.success(t('subscriptions.messages.renewed', { name }))
      await Promise.all([
        'subscriptions', 'subscription-detail', 'subscription-payment-records', 'payment-history',
        'statistics-overview', 'statistics-budgets', 'calendar-events', 'dashboard-ai-summary'
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('common.errors.requestFailed'))
    } finally {
      renewingIds.value.delete(id)
    }
  }

  return { renewingIds, renew }
}
