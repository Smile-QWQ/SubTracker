import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getOverviewStatisticsMock,
  getBudgetStatisticsMock,
  getCacheVersionMock,
  withWorkerTieredCacheMock
} = vi.hoisted(() => ({
  getOverviewStatisticsMock: vi.fn(),
  getBudgetStatisticsMock: vi.fn(),
  getCacheVersionMock: vi.fn(),
  withWorkerTieredCacheMock: vi.fn()
}))

vi.mock('../../src/services/statistics.service', () => ({
  getOverviewStatistics: getOverviewStatisticsMock,
  getBudgetStatistics: getBudgetStatisticsMock
}))

vi.mock('../../src/services/cache-version.service', () => ({
  getCacheVersion: getCacheVersionMock
}))

vi.mock('../../src/services/worker-tiered-cache.service', () => ({
  withWorkerTieredCache: withWorkerTieredCacheMock
}))

import { statisticsRoutes } from '../../src/routes/statistics'

describe('statistics routes cache', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    getCacheVersionMock.mockResolvedValue(11)
    getOverviewStatisticsMock.mockResolvedValue({
      activeSubscriptions: 2,
      upcoming7Days: 1,
      upcoming30Days: 1,
      monthlyEstimatedBase: 100,
      yearlyEstimatedBase: 1200,
      monthlyBudgetBase: null,
      yearlyBudgetBase: null,
      monthlyBudgetUsageRatio: null,
      yearlyBudgetUsageRatio: null,
      budgetSummary: {
        monthly: { spent: 100, budget: null, ratio: null, overBudget: 0, status: 'normal' },
        yearly: { spent: 1200, budget: null, ratio: null, overBudget: 0, status: 'normal' }
      },
      tagSpend: [],
      monthlyTrend: [],
      monthlyTrendMeta: { mode: 'projected', months: 12 },
      statusDistribution: [],
      renewalModeDistribution: [],
      upcomingByDay: [],
      tagBudgetUsage: [],
      currencyDistribution: [],
      topSubscriptionsByMonthlyCost: [],
      upcomingRenewals: []
    })
    getBudgetStatisticsMock.mockResolvedValue({
      enabledTagBudgets: false,
      budgetSummary: {
        monthly: { spent: 100, budget: null, ratio: null, overBudget: 0, status: 'normal' },
        yearly: { spent: 1200, budget: null, ratio: null, overBudget: 0, status: 'normal' }
      },
      tagBudgetSummary: null,
      tagBudgetUsage: []
    })
    withWorkerTieredCacheMock.mockImplementation(
      async (_namespace: string, _cacheKey: string, loader: () => Promise<unknown>) => loader()
    )

    app = Fastify()
    await statisticsRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('uses tiered cache for GET /statistics/overview and preserves overview fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/statistics/overview'
    })

    expect(res.statusCode).toBe(200)
    expect(getCacheVersionMock).toHaveBeenCalledWith('statistics')
    expect(withWorkerTieredCacheMock).toHaveBeenCalledWith(
      'statistics',
      'overview:v11',
      expect.any(Function),
      300
    )
    expect(res.json().data).toEqual(
      expect.objectContaining({
        monthlyTrend: [],
        upcomingByDay: [],
        tagSpend: [],
        tagBudgetUsage: []
      })
    )
  })
})
