import { beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
const getRuntimeD1Database = vi.fn()
const isWorkerRuntime = vi.fn()

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany
    }
  }
}))

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database,
  isWorkerRuntime
}))

describe('listSubscriptionsLite chunking', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    isWorkerRuntime.mockReturnValue(true)
  })

  it('chunks subscription tag lookups to avoid too many SQL variables in D1', async () => {
    const preparedQueries: string[] = []
    const bindingsPerQuery: unknown[][] = []

    getRuntimeD1Database.mockReturnValue({
      prepare(query: string) {
        preparedQueries.push(query)
        return {
          bind(...values: unknown[]) {
            bindingsPerQuery.push(values)
            return this
          },
          async all() {
            if (query.includes('FROM Subscription s')) {
              return {
                results: Array.from({ length: 120 }, (_, index) => ({
                  id: `sub-${index + 1}`,
                  name: `Subscription ${index + 1}`,
                  description: '',
                  websiteUrl: null,
                  logoUrl: null,
                  logoSource: null,
                  logoFetchedAt: null,
                  status: 'active',
                  amount: 10,
                  currency: 'USD',
                  billingIntervalCount: 1,
                  billingIntervalUnit: 'month',
                  autoRenew: 0,
                  startDate: '2026-01-01T00:00:00.000Z',
                  nextRenewalDate: '2026-02-01T00:00:00.000Z',
                  notifyDaysBefore: 3,
                  advanceReminderRules: null,
                  overdueReminderRules: null,
                  webhookEnabled: 1,
                  notes: '',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z'
                }))
              }
            }

            return { results: [] }
          },
          async first() {
            return null
          },
          async run() {
            return {}
          }
        }
      }
    })

    const { listSubscriptionsLite } = await import('../../src/services/worker-lite-repository.service')

    const rows = await listSubscriptionsLite()

    expect(rows).toHaveLength(120)

    const tagQueries = preparedQueries.filter((query) => query.includes('FROM SubscriptionTag st'))
    expect(tagQueries).toHaveLength(3)

    const tagQueryBindings = bindingsPerQuery
    expect(tagQueryBindings).toHaveLength(3)
    expect(tagQueryBindings[0]).toHaveLength(50)
    expect(tagQueryBindings[1]).toHaveLength(50)
    expect(tagQueryBindings[2]).toHaveLength(20)
  })

  it('requires every selected tag when building D1 subscription filters', async () => {
    const preparedQueries: string[] = []
    const bindingsPerQuery: unknown[][] = []

    getRuntimeD1Database.mockReturnValue({
      prepare(query: string) {
        preparedQueries.push(query)
        return {
          bind(...values: unknown[]) {
            bindingsPerQuery.push(values)
            return this
          },
          async all() {
            return { results: [] }
          },
          async first() {
            return null
          },
          async run() {
            return {}
          }
        }
      }
    })

    const { listSubscriptionsLite } = await import('../../src/services/worker-lite-repository.service')

    await listSubscriptionsLite({
      tagIds: ['tag_a', 'tag_b']
    })

    const subscriptionQuery = preparedQueries.find((query) => query.includes('FROM Subscription s'))
    expect(subscriptionQuery).toContain('EXISTS (SELECT 1 FROM SubscriptionTag st WHERE st.subscriptionId = s.id AND st.tagId = ?)')
    expect(subscriptionQuery?.match(/EXISTS \(SELECT 1 FROM SubscriptionTag st WHERE st\.subscriptionId = s\.id AND st\.tagId = \?\)/g))
      .toHaveLength(2)
    expect(bindingsPerQuery[0]).toEqual(['tag_a', 'tag_b'])
  })

  it('supports webhookEnabled and includeTags filters in D1 subscription queries', async () => {
    const preparedQueries: string[] = []
    const bindingsPerQuery: unknown[][] = []

    getRuntimeD1Database.mockReturnValue({
      prepare(query: string) {
        preparedQueries.push(query)
        return {
          bind(...values: unknown[]) {
            bindingsPerQuery.push(values)
            return this
          },
          async all() {
            return { results: [] }
          },
          async first() {
            return null
          },
          async run() {
            return {}
          }
        }
      }
    })

    const { listSubscriptionsLite } = await import('../../src/services/worker-lite-repository.service')

    await listSubscriptionsLite({
      webhookEnabled: true,
      includeTags: false
    })

    const subscriptionQuery = preparedQueries.find((query) => query.includes('FROM Subscription s'))
    expect(subscriptionQuery).toContain('s.webhookEnabled = ?')
    expect(bindingsPerQuery[0]).toEqual([1])
    expect(preparedQueries.some((query) => query.includes('FROM SubscriptionTag st'))).toBe(false)
  })
})
