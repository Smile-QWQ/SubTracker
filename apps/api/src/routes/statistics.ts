import { FastifyInstance } from 'fastify'
import { sendOk } from '../http'
import { getCacheVersion } from '../services/cache-version.service'
import { getOverviewStatistics } from '../services/statistics.service'
import { withWorkerTieredCache } from '../services/worker-tiered-cache.service'

const OVERVIEW_CACHE_TTL_SECONDS = 5 * 60

export async function statisticsRoutes(app: FastifyInstance) {
  app.get('/statistics/overview', async (_, reply) => {
    const version = await getCacheVersion('statistics')
    const overview = await withWorkerTieredCache(
      'statistics',
      `overview:v${version}`,
      () => getOverviewStatistics(version),
      OVERVIEW_CACHE_TTL_SECONDS
    )
    return sendOk(reply, overview)
  })
}
