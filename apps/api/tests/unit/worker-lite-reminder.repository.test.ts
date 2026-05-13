import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRuntimeD1Database = vi.fn()
const isWorkerRuntime = vi.fn()
const findManyMock = vi.fn()

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database,
  isWorkerRuntime
}))

vi.mock('../../src/db', () => ({
  prisma: {
    subscription: {
      findMany: findManyMock
    }
  }
}))

describe('worker-lite reminder repository', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('uses SQL-level custom-rule filtering in the D1 custom reminder window', async () => {
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
            return {
              results: [
                {
                  id: 'sub-1',
                  name: 'GitHub',
                  nextRenewalDate: '2026-05-10T00:00:00.000Z',
                  notifyDaysBefore: 3,
                  advanceReminderRules: '10&09:30;',
                  overdueReminderRules: null,
                  amount: 10,
                  currency: 'USD',
                  status: 'active',
                  websiteUrl: 'https://github.com',
                  notes: ''
                }
              ]
            }
          }
        }
      }
    })

    const { listReminderScanSubscriptionsCustomWindow } = await import('../../src/services/worker-lite-reminder.repository')

    const rows = await listReminderScanSubscriptionsCustomWindow({
      queryStart: new Date('2026-05-04T00:00:00.000Z'),
      queryEnd: new Date('2026-06-01T00:00:00.000Z')
    })

    expect(rows).toHaveLength(1)
    expect(preparedQueries[0]).toContain('s.webhookEnabled = 1')
    expect(preparedQueries[0]).toContain("s.advanceReminderRules IS NOT NULL AND TRIM(s.advanceReminderRules) != ''")
    expect(preparedQueries[0]).toContain("s.overdueReminderRules IS NOT NULL AND TRIM(s.overdueReminderRules) != ''")
    expect(preparedQueries[0]).not.toContain('SubscriptionTag')
    expect(bindingsPerQuery[0]).toEqual([
      '2026-05-04T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z'
    ])
  })

  it('uses minimal Prisma selects for reminder scan windows outside worker runtime', async () => {
    isWorkerRuntime.mockReturnValue(false)
    findManyMock.mockResolvedValue([
      {
        id: 'sub-2',
        name: 'Notion',
        nextRenewalDate: new Date('2026-05-08T00:00:00.000Z'),
        notifyDaysBefore: 2,
        advanceReminderRules: '',
        overdueReminderRules: '',
        amount: 8.8,
        currency: 'USD',
        status: 'active',
        websiteUrl: 'https://notion.so',
        notes: 'workspace'
      }
    ])

    const { listReminderScanSubscriptionsDefaultWindow } = await import('../../src/services/worker-lite-reminder.repository')

    const rows = await listReminderScanSubscriptionsDefaultWindow({
      queryStart: new Date('2026-05-01T00:00:00.000Z'),
      queryEnd: new Date('2026-05-09T00:00:00.000Z')
    })

    expect(rows).toHaveLength(1)
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        status: { in: ['active', 'expired'] },
        webhookEnabled: true,
        nextRenewalDate: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lte: new Date('2026-05-09T00:00:00.000Z')
        }
      },
      select: {
        id: true,
        name: true,
        nextRenewalDate: true,
        notifyDaysBefore: true,
        advanceReminderRules: true,
        overdueReminderRules: true,
        amount: true,
        currency: true,
        status: true,
        websiteUrl: true,
        notes: true
      },
      orderBy: [{ createdAt: 'asc' }]
    })
  })
})
