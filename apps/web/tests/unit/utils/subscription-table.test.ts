import { describe, expect, it } from 'vitest'
import type { Subscription } from '../../../src/types/api'
import { buildSubscriptionTableRows, paginateSubscriptions } from '../../../src/utils/subscription-table'

function createSubscription(id: string, overrides: Partial<Subscription> = {}): Subscription {
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
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('subscription-table utils', () => {
  it('builds a note row immediately after the main row', () => {
    const rows = buildSubscriptionTableRows([
      createSubscription('a', { notes: '  备注 A  ' }),
      createSubscription('b')
    ])

    expect(rows.map((item) => item.id)).toEqual(['a', 'a__note', 'b'])
    expect(rows[1]).toMatchObject({
      __rowType: 'note',
      note: '备注 A',
      subscriptionId: 'a'
    })
  })

  it('paginates subscriptions before note rows are expanded', () => {
    const pageItems = paginateSubscriptions(
      [
        createSubscription('a', { notes: '备注 A' }),
        createSubscription('b'),
        createSubscription('c')
      ],
      1,
      2
    )

    const rows = buildSubscriptionTableRows(pageItems)

    expect(pageItems.map((item) => item.id)).toEqual(['a', 'b'])
    expect(rows.map((item) => item.id)).toEqual(['a', 'a__note', 'b'])
  })
})
