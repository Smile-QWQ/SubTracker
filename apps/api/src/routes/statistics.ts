import { FastifyInstance } from 'fastify'
import { sendOk } from '../http'
import { withWorkerLiteCache } from '../services/worker-lite-cache.service'
import { getBudgetStatistics, getOverviewStatistics } from '../services/statistics.service'

export async function statisticsRoutes(app: FastifyInstance) {
  app.get('/statistics/overview', async (_, reply) => {
    const overview = await withWorkerLiteCache('statistics', 'overview', getOverviewStatistics, 30)
    return sendOk(reply, overview)
  })

  app.get('/statistics/budgets', async (_, reply) => {
    const budgets = await withWorkerLiteCache('statistics', 'budgets', getBudgetStatistics, 30)
    return sendOk(reply, budgets)
  })
}
