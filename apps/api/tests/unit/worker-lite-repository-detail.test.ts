import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueOrThrow = vi.fn()
const paymentRecordFindMany = vi.fn()
const getRuntimeD1Database = vi.fn()
const isWorkerRuntime = vi.fn()

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findUniqueOrThrow
    },
    paymentRecord: {
      findMany: paymentRecordFindMany
    }
  }
}))

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database,
  isWorkerRuntime
}))

describe('worker-lite repository detail helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    isWorkerRuntime.mockReturnValue(true)
  })

  it('loads a subscription with tags from D1 for detail routes', async () => {
    const preparedQueries: string[] = []

    getRuntimeD1Database.mockReturnValue({
      prepare(query: string) {
        preparedQueries.push(query)
        return {
          bind() {
            return this
          },
          async all() {
            if (query.includes('FROM Subscription s')) {
              return {
                results: [
                  {
                    id: 'sub_1',
                    name: 'Netflix',
                    description: '',
                    websiteUrl: 'https://example.com',
                    logoUrl: null,
                    logoSource: null,
                    logoFetchedAt: null,
                    status: 'active',
                    amount: 10,
                    currency: 'USD',
                    billingIntervalCount: 1,
                    billingIntervalUnit: 'month',
                    autoRenew: 1,
                    startDate: '2026-05-01T00:00:00.000Z',
                    nextRenewalDate: '2026-06-01T00:00:00.000Z',
                    notifyDaysBefore: 3,
                    advanceReminderRules: null,
                    overdueReminderRules: null,
                    webhookEnabled: 1,
                    notes: '',
                    createdAt: '2026-05-01T00:00:00.000Z',
                    updatedAt: '2026-05-01T00:00:00.000Z'
                  }
                ]
              }
            }

            if (query.includes('FROM SubscriptionTag st')) {
              return {
                results: [
                  {
                    subscriptionId: 'sub_1',
                    tagId: 'tag_1',
                    tagName: '视频',
                    tagColor: '#ff0000',
                    tagIcon: 'play',
                    tagSortOrder: 1
                  }
                ]
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

    const { getSubscriptionWithTagsLite } = await import('../../src/services/worker-lite-repository.service')
    const result = await getSubscriptionWithTagsLite('sub_1')

    expect(result).toMatchObject({
      id: 'sub_1',
      name: 'Netflix',
      autoRenew: true,
      webhookEnabled: true
    })
    expect(result.tags).toEqual([
      {
        tag: {
          id: 'tag_1',
          name: '视频',
          color: '#ff0000',
          icon: 'play',
          sortOrder: 1
        }
      }
    ])
    expect(preparedQueries.some((query) => query.includes('FROM Subscription s'))).toBe(true)
    expect(preparedQueries.some((query) => query.includes('FROM SubscriptionTag st'))).toBe(true)
  })

  it('loads payment records from D1 in descending paidAt order', async () => {
    getRuntimeD1Database.mockReturnValue({
      prepare(query: string) {
        return {
          bind() {
            return this
          },
          async all() {
            if (query.includes('FROM PaymentRecord')) {
              return {
                results: [
                  {
                    id: 'payment_2',
                    subscriptionId: 'sub_1',
                    amount: 20,
                    currency: 'USD',
                    baseCurrency: 'CNY',
                    convertedAmount: 144,
                    exchangeRate: 7.2,
                    paidAt: '2026-05-10T00:00:00.000Z',
                    periodStart: '2026-05-01T00:00:00.000Z',
                    periodEnd: '2026-06-01T00:00:00.000Z',
                    createdAt: '2026-05-10T00:00:00.000Z'
                  }
                ]
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

    const { listSubscriptionPaymentRecordsLite } = await import('../../src/services/worker-lite-repository.service')
    const result = await listSubscriptionPaymentRecordsLite('sub_1')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'payment_2',
      subscriptionId: 'sub_1',
      amount: 20,
      currency: 'USD',
      baseCurrency: 'CNY',
      convertedAmount: 144,
      exchangeRate: 7.2
    })
    expect(result[0].paidAt).toBeInstanceOf(Date)
    expect(result[0].periodStart).toBeInstanceOf(Date)
    expect(result[0].periodEnd).toBeInstanceOf(Date)
    expect(result[0].createdAt).toBeInstanceOf(Date)
  })
})
