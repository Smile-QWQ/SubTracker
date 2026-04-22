import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

vi.mock('../../src/services/settings.service', () => ({
  getSetting: vi.fn(async <T>(key: string, fallbackValue: T) =>
    (store.has(key) ? (store.get(key) as T) : fallbackValue)
  ),
  setSetting: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  })
}))

import {
  appendSubscriptionOrder,
  appendSubscriptionOrders,
  getSubscriptionOrder,
  removeSubscriptionOrder,
  setSubscriptionOrder,
  sortSubscriptionsByOrder
} from '../../src/services/subscription-order.service'

describe('subscription order service', () => {
  beforeEach(() => {
    store.clear()
  })

  it('should persist unique ids in order', async () => {
    await setSubscriptionOrder(['sub-2', 'sub-1', 'sub-2', 'sub-3'])

    await expect(getSubscriptionOrder()).resolves.toEqual(['sub-2', 'sub-1', 'sub-3'])
  })

  it('should append and remove ids', async () => {
    await appendSubscriptionOrder('sub-1')
    await appendSubscriptionOrder('sub-2')
    await appendSubscriptionOrder('sub-1')
    await removeSubscriptionOrder('sub-2')

    await expect(getSubscriptionOrder()).resolves.toEqual(['sub-1'])
  })

  it('should append multiple ids in one pass while preserving uniqueness', async () => {
    await setSubscriptionOrder(['sub-1'])
    await appendSubscriptionOrders(['sub-2', 'sub-3', 'sub-2', 'sub-1', 'sub-4'])

    await expect(getSubscriptionOrder()).resolves.toEqual(['sub-1', 'sub-2', 'sub-3', 'sub-4'])
  })

  it('should sort subscriptions by stored custom order', async () => {
    await setSubscriptionOrder(['sub-3', 'sub-1'])

    const rows = await sortSubscriptionsByOrder([
      { id: 'sub-1', name: 'A' },
      { id: 'sub-2', name: 'B' },
      { id: 'sub-3', name: 'C' }
    ])

    expect(rows.map((row) => row.id)).toEqual(['sub-3', 'sub-1', 'sub-2'])
  })
})
