import type { Subscription, SubscriptionStatus } from '@/types/api'
import { t } from '@/locales'

export type BatchSettableStatus = Extract<SubscriptionStatus, 'active' | 'paused' | 'cancelled'>

export function getVisiblePageSubscriptionIds(params: {
  isMobile: boolean
  orderedSubscriptions: Subscription[]
  pagedSubscriptions: Subscription[]
}) {
  const source = params.isMobile ? params.orderedSubscriptions : params.pagedSubscriptions
  return source.map((item) => item.id)
}

export function mergeSelectedSubscriptionIds(selectedIds: string[], idsToAdd: string[]) {
  return Array.from(new Set([...selectedIds, ...idsToAdd]))
}

export function removeSelectedSubscriptionIds(selectedIds: string[], idsToRemove: string[]) {
  const removeSet = new Set(idsToRemove)
  return selectedIds.filter((id) => !removeSet.has(id))
}

export function areAllVisibleSubscriptionsSelected(visibleIds: string[], selectedIds: string[]) {
  return visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
}

export function getBatchStatusText(status: BatchSettableStatus) {
  return {
    active: t('subscriptions.status.active'),
    paused: t('subscriptions.status.paused'),
    cancelled: t('subscriptions.status.cancelled')
  }[status]
}

export function countBatchDeletableSubscriptions(subscriptions: Array<Pick<Subscription, 'status'>>) {
  const deletableCount = subscriptions.filter((item) => item.status !== 'active').length
  return {
    deletableCount,
    blockedCount: subscriptions.length - deletableCount
  }
}
