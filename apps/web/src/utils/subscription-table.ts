import type { Subscription } from '@/types/api'

export type SubscriptionTableRow =
  | (Subscription & { __rowType: 'main' })
  | {
      id: string
      __rowType: 'note'
      note: string
      subscriptionId: string
    }

export function buildSubscriptionTableRows(items: Subscription[]): SubscriptionTableRow[] {
  return items.flatMap((item) => {
    const rows: SubscriptionTableRow[] = [{ ...item, __rowType: 'main' }]
    if (item.notes?.trim()) {
      rows.push({
        id: `${item.id}__note`,
        __rowType: 'note',
        note: item.notes.trim(),
        subscriptionId: item.id
      })
    }
    return rows
  })
}

export function canRenewSubscription(subscription: Subscription): boolean {
  return subscription.billingType !== 'lifetime' && (subscription.status === 'active' || subscription.status === 'expired')
}

export function compareSubscriptionRenewalDates(a: Subscription, b: Subscription): number {
  // Lifetime dates are storage placeholders, never renewal dates. Keep these rows last.
  if (a.billingType === 'lifetime') return b.billingType === 'lifetime' ? 0 : 1
  if (b.billingType === 'lifetime') return -1
  return a.nextRenewalDate.localeCompare(b.nextRenewalDate)
}

export function paginateSubscriptions<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page)
  const safePageSize = Math.max(1, pageSize)
  const start = (safePage - 1) * safePageSize
  return items.slice(start, start + safePageSize)
}
