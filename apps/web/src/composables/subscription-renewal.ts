import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import type { RenewalPaymentOverride } from '@subtracker/shared'
import type { Subscription } from '@/types/api'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { canRenewSubscription } from '@/utils/subscription-table'
import { useLocalizedMessage } from '@/utils/localized-message'

export function useSubscriptionRenewal(options: { onRenewed?: (ids: string[]) => Promise<void> } = {}) {
  const queryClient = useQueryClient()
  const message = useLocalizedMessage()
  const renewingIds = ref(new Set<string>())
  const renewalOpen = ref(false)
  const renewalSaving = ref(false)
  const renewalBatch = ref(false)
  const renewalSubscriptions = ref<Subscription[]>([])
  const renewalErrors = ref<Record<string, string>>({})
  let disposed = false
  if (getCurrentScope()) onScopeDispose(() => { disposed = true })

  async function renew(id: string, _name: string) {
    if (renewalOpen.value || renewingIds.value.size || disposed) return
    renewingIds.value.add(id)
    try {
      const subscription = await api.getSubscription(id)
      if (disposed) return
      if (!canRenewSubscription(subscription)) { message.error(t('subscriptions.renewal.unavailable')); return }
      renewalSubscriptions.value = [subscription]
      renewalBatch.value = false
      renewalErrors.value = {}
      renewalOpen.value = true
    } catch (error) {
      if (!disposed) message.error(error instanceof Error ? error.message : t('common.errors.requestFailed'))
    } finally { renewingIds.value.delete(id) }
  }

  function renewMany(subscriptions: Subscription[]) {
    if (renewalOpen.value || renewingIds.value.size || disposed) return
    const eligible = subscriptions.filter(subscription => subscription.billingType !== 'lifetime')
    if (!eligible.length) return
    renewalSubscriptions.value = [...new Map(eligible.map(row => [row.id, row])).values()]
    renewalBatch.value = true
    renewalErrors.value = {}
    renewalOpen.value = true
  }

  function cancelRenewal() {
    if (renewalSaving.value) return
    renewalOpen.value = false
    renewalSubscriptions.value = []
    renewalErrors.value = {}
  }

  async function confirmRenewal(payments: RenewalPaymentOverride[]) {
    if (!renewalOpen.value || renewalSaving.value || disposed) return
    const subscriptions = [...renewalSubscriptions.value]
    const ids = subscriptions.map(row => row.id)
    renewalSaving.value = true
    renewingIds.value = new Set(ids)
    let completedIds: string[] = []
    try {
      if (renewalBatch.value) {
        const result = await api.batchRenewSubscriptions(ids, payments)
        const failed = new Set(result.failures.map(failure => failure.id))
        completedIds = result.successCount > 0 ? ids.filter(id => !failed.has(id)) : []
        if (result.failureCount) {
          renewalErrors.value = Object.fromEntries(result.failures.map(failure => [failure.id, failure.message.startsWith('api.') ? t(failure.message) : failure.message]))
          renewalSubscriptions.value = subscriptions.filter(row => !completedIds.includes(row.id))
          message.warning(t('subscriptions.messages.batchActionPartial', { label: t('subscriptions.actions.batchRenew'), success: result.successCount, failure: result.failureCount }))
        } else {
          renewalOpen.value = false
          message.success(t('subscriptions.messages.batchActionSuccess', { label: t('subscriptions.actions.batchRenew'), count: result.successCount }))
        }
      } else {
        const subscription = subscriptions[0]
        const payment = payments.find(item => item.id === subscription.id)
        if (!payment) throw new Error(t('subscriptions.renewal.invalidAmount'))
        await api.renewSubscription(subscription.id, { amount: payment.amount, currency: payment.currency })
        completedIds = [subscription.id]
        renewalOpen.value = false
        message.success(t('subscriptions.messages.renewed', { name: subscription.name }))
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('common.errors.requestFailed'))
    } finally {
      // Refresh after a payment without turning a refresh failure into another renewal attempt.
      if (completedIds.length) {
        try {
          await Promise.all([
            'subscriptions', 'subscription-detail', 'subscription-payment-records', 'payment-history',
            'statistics-overview', 'statistics-budgets', 'calendar-events', 'dashboard-ai-summary'
          ].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
          await options.onRenewed?.(completedIds)
        } catch { message.error(t('subscriptions.renewal.refreshFailed')) }
      }
      renewalSaving.value = false
      renewingIds.value.clear()
    }
  }

  return { renewingIds, renew, renewMany, renewalOpen, renewalSaving, renewalBatch, renewalSubscriptions, renewalErrors, confirmRenewal, cancelRenewal }
}
