import { FastifyInstance } from 'fastify'
import { sendOk } from '../http'
import { getBudgetStatistics, getOverviewStatistics } from '../services/statistics.service'

export async function statisticsRoutes(app: FastifyInstance) {
  app.get('/statistics/overview', async (_, reply) => {
    const overview = await getOverviewStatistics()
    return sendOk(reply, overview)
  })

  app.get('/statistics/budgets', async (_, reply) => {
    const budgets = await getBudgetStatistics()
    return sendOk(reply, budgets)
  })
}
