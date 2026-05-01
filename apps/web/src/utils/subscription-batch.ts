import type { Subscription, SubscriptionStatus } from '@/types/api'

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
    active: '正常',
    paused: '暂停',
    cancelled: '停用'
  }[status]
}
