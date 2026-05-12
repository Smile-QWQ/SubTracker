import { describe, expect, it } from 'vitest'
import type { Subscription } from '@/types/api'
import {
  areAllVisibleSubscriptionsSelected,
  countBatchDeletableSubscriptions,
  getBatchStatusText,
  getVisiblePageSubscriptionIds,
  mergeSelectedSubscriptionIds,
  removeSelectedSubscriptionIds
} from '@/utils/subscription-batch'

function createSubscription(id: string): Subscription {
  return {
    id,
    name: `sub-${id}`,
    description: '',
    websiteUrl: '',
    logoUrl: '',
    logoSource: '',
    logoFetchedAt: '',
    status: 'active',
    amount: 10,
    currency: 'CNY',
    billingIntervalCount: 1,
    billingIntervalUnit: 'month',
    autoRenew: true,
    startDate: '2026-01-01',
    nextRenewalDate: '2026-02-01',
    notifyDaysBefore: 3,
    webhookEnabled: true,
    notes: '',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('subscription batch utils', () => {
  it('uses current desktop page ids for select all on desktop', () => {
    expect(
      getVisiblePageSubscriptionIds({
        isMobile: false,
        orderedSubscriptions: [createSubscription('a'), createSubscription('b'), createSubscription('c')],
        pagedSubscriptions: [createSubscription('b'), createSubscription('c')]
      })
    ).toEqual(['b', 'c'])
  })

  it('uses all rendered filtered ids for select all on mobile', () => {
    expect(
      getVisiblePageSubscriptionIds({
        isMobile: true,
        orderedSubscriptions: [createSubscription('a'), createSubscription('b'), createSubscription('c')],
        pagedSubscriptions: [createSubscription('b'), createSubscription('c')]
      })
    ).toEqual(['a', 'b', 'c'])
  })

  it('adds and removes visible ids without duplicating selections', () => {
    expect(mergeSelectedSubscriptionIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(removeSelectedSubscriptionIds(['a', 'b', 'c'], ['b', 'c'])).toEqual(['a'])
  })

  it('detects whether all visible subscriptions are selected', () => {
    expect(areAllVisibleSubscriptionsSelected(['a', 'b'], ['a', 'b', 'c'])).toBe(true)
    expect(areAllVisibleSubscriptionsSelected(['a', 'b'], ['a'])).toBe(false)
    expect(areAllVisibleSubscriptionsSelected([], ['a'])).toBe(false)
  })

  it('labels settable batch statuses', () => {
    expect(getBatchStatusText('active')).toBe('正常')
    expect(getBatchStatusText('paused')).toBe('暂停')
    expect(getBatchStatusText('cancelled')).toBe('停用')
  })

  it('counts deletable and blocked subscriptions for batch delete', () => {
    expect(
      countBatchDeletableSubscriptions([
        createSubscription('a'),
        { ...createSubscription('b'), status: 'paused' },
        { ...createSubscription('c'), status: 'cancelled' }
      ])
    ).toEqual({
      deletableCount: 2,
      blockedCount: 1
    })
  })

  it('retains richer subscription detail-compatible shape', () => {
    const subscription = createSubscription('detail')
    expect(subscription).toMatchObject({
      id: 'detail',
      notifyDaysBefore: 3,
      webhookEnabled: true
    })
  })
})
