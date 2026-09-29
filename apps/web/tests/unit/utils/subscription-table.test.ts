import { describe, expect, it } from 'vitest'
import type { Subscription } from '../../../src/types/api'
import { buildSubscriptionTableRows, canRenewSubscription, compareSubscriptionRenewalDates, paginateSubscriptions } from '../../../src/utils/subscription-table'

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
  it('never offers renewal for lifetime subscriptions, including expired records', () => {
    expect(canRenewSubscription(createSubscription('legacy'))).toBe(true)
    expect(canRenewSubscription(createSubscription('recurring', { billingType: 'recurring', status: 'expired' }))).toBe(true)
    expect(canRenewSubscription(createSubscription('paused', { status: 'paused' }))).toBe(false)
    expect(canRenewSubscription(createSubscription('lifetime', { billingType: 'lifetime' }))).toBe(false)
    expect(canRenewSubscription(createSubscription('expired-lifetime', { billingType: 'lifetime', status: 'expired' }))).toBe(false)
  })

  it('sorts lifetime records after real renewal dates instead of using their placeholder date', () => {
    const records = [
      createSubscription('lifetime', { billingType: 'lifetime', nextRenewalDate: '2000-01-01' }),
      createSubscription('later', { nextRenewalDate: '2026-03-01' }),
      createSubscription('earlier')
    ]
    expect(records.sort(compareSubscriptionRenewalDates).map((item) => item.id)).toEqual(['earlier', 'later', 'lifetime'])
    expect(compareSubscriptionRenewalDates(records[2], { ...records[2], nextRenewalDate: '2099-01-01' })).toBe(0)
  })

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
