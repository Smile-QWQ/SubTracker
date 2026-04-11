import { FastifyInstance } from 'fastify'
import { sendOk } from '../http'
import { getOverviewStatistics } from '../services/statistics.service'

export async function statisticsRoutes(app: FastifyInstance) {
  app.get('/statistics/overview', async (_, reply) => {
    const overview = await getOverviewStatistics()
    return sendOk(reply, overview)
  })
}
