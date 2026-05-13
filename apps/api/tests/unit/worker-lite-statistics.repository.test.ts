import { beforeEach, describe, expect, it, vi } from 'vitest'

const prepareMock = vi.fn()
const getRuntimeD1Database = vi.fn()
const isWorkerRuntime = vi.fn()
const findManyMock = vi.fn()
const countMock = vi.fn()

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database,
  isWorkerRuntime
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany: findManyMock,
      count: countMock
    }
  }
}))

describe('worker-lite statistics repository', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('uses dedicated D1 overview queries without tag joins', async () => {
    isWorkerRuntime.mockReturnValue(true)
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
            if (query.includes('GROUP BY s.status')) {
              return {
                results: [
                  { status: 'active', count: 2 },
                  { status: 'expired', count: 1 }
                ]
              }
            }

            if (query.includes("WHERE s.status = 'active'")) {
              return {
                results: [
                  {
                    id: 'sub-1',
                    name: 'A',
                    amount: 10,
                    currency: 'USD',
                    billingIntervalCount: 1,
                    billingIntervalUnit: 'month',
                    autoRenew: 1
                  }
                ]
              }
            }

            if (query.includes('ORDER BY s.nextRenewalDate ASC')) {
              return {
                results: [
                  {
                    id: 'sub-2',
                    name: 'Upcoming',
                    amount: 30,
                    currency: 'CNY',
                    status: 'expired',
                    nextRenewalDate: '2026-05-10T00:00:00.000Z'
                  }
                ]
              }
            }

            return { results: [] }
          },
          async first() {
            if (query.includes('SUM(CASE WHEN')) {
              return {
                upcoming7DaysCount: 1,
                upcoming30DaysCount: 3
              }
            }
            return null
          },
          async run() {
            return {}
          }
        }
      }
    })

    const { getLiteOverviewStatisticsSnapshot } = await import('../../src/services/worker-lite-statistics.repository')

    const result = await getLiteOverviewStatisticsSnapshot({
      queryStart: new Date('2026-05-01T00:00:00.000Z'),
      upcoming7End: new Date('2026-05-08T00:00:00.000Z'),
      upcoming30End: new Date('2026-05-31T00:00:00.000Z'),
      upcomingQueryEnd: new Date('2026-05-31T00:00:00.000Z')
    })

    expect(result.statusCounts).toEqual([
      { status: 'active', count: 2 },
      { status: 'paused', count: 0 },
      { status: 'cancelled', count: 0 },
      { status: 'expired', count: 1 }
    ])
    expect(result.upcomingCounts).toEqual({
      upcoming7DaysCount: 1,
      upcoming30DaysCount: 3
    })
    expect(result.upcomingRenewals[0]).toMatchObject({
      id: 'sub-2',
      status: 'expired'
    })
    expect(preparedQueries.some((query) => query.includes('FROM SubscriptionTag st'))).toBe(false)
    expect(bindingsPerQuery).toHaveLength(2)
    expect(bindingsPerQuery[0]).toHaveLength(6)
    expect(bindingsPerQuery[1]).toHaveLength(2)
  })

  it('falls back to Prisma snapshot queries outside worker runtime', async () => {
    isWorkerRuntime.mockReturnValue(false)
    findManyMock
      .mockResolvedValueOnce([
        { status: 'active' },
        { status: 'active' },
        { status: 'paused' }
      ])
      .mockResolvedValueOnce([
        {
          id: 'sub-1',
          name: 'One',
          amount: 10,
          currency: 'CNY',
          billingIntervalCount: 1,
          billingIntervalUnit: 'month',
          autoRenew: true
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'sub-2',
          name: 'Soon',
          amount: 20,
          currency: 'USD',
          status: 'active',
          nextRenewalDate: new Date('2026-05-02T00:00:00.000Z')
        }
      ])
    countMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)

    const { getLiteOverviewStatisticsSnapshot } = await import('../../src/services/worker-lite-statistics.repository')

    const result = await getLiteOverviewStatisticsSnapshot({
      queryStart: new Date('2026-05-01T00:00:00.000Z'),
      upcoming7End: new Date('2026-05-08T00:00:00.000Z'),
      upcoming30End: new Date('2026-05-31T00:00:00.000Z'),
      upcomingQueryEnd: new Date('2026-05-31T00:00:00.000Z')
    })

    expect(countMock).toHaveBeenCalledTimes(2)
    expect(findManyMock).toHaveBeenCalledTimes(3)
    expect(result.activeSubscriptions).toHaveLength(1)
    expect(result.statusCounts).toEqual([
      { status: 'active', count: 2 },
      { status: 'paused', count: 1 },
      { status: 'cancelled', count: 0 },
      { status: 'expired', count: 0 }
    ])
    expect(result.upcomingCounts).toEqual({
      upcoming7DaysCount: 1,
      upcoming30DaysCount: 2
    })
  })
})
