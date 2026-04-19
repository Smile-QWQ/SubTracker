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

export function paginateSubscriptions<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page)
  const safePageSize = Math.max(1, pageSize)
  const start = (safePage - 1) * safePageSize
  return items.slice(start, start + safePageSize)
}
