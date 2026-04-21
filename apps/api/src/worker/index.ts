import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { Hono } from 'hono'
import { authRoutes } from '../routes/auth'
import { tagRoutes } from '../routes/tags'
import { subscriptionRoutes } from '../routes/subscriptions'
import { statisticsRoutes } from '../routes/statistics'
import { calendarRoutes } from '../routes/calendar'
import { exchangeRateRoutes } from '../routes/exchange-rates'
import { settingsRoutes } from '../routes/settings'
import { notificationRoutes } from '../routes/notifications'
import { aiRoutes } from '../routes/ai'
import { importRoutes } from '../routes/imports'
import { ensureDatabaseInitialized } from './database-init'
import { LegacyFastifyApp, serveStaticLogo } from './legacy-fastify'
import { runWithRuntimeContext, type WorkerBindings } from '../runtime'
import { autoRenewDueSubscriptions } from '../services/subscription.service'
import { scanRenewalNotifications } from '../services/notification.service'
import { refreshExchangeRates } from '../services/exchange-rate.service'
import type { D1Database, ExecutionContext, ScheduledController } from './types'
import { requiresWorkerRuntimeContext } from './request-routing'

const app = new Hono<{ Bindings: WorkerBindings }>()

function getPrismaClient(db: D1Database) {
  return new PrismaClient({
    adapter: new PrismaD1(db as any)
  })
}

async function bootstrapRoutes() {
  const legacy = new LegacyFastifyApp(app as unknown as Hono, '/api/v1')
  await authRoutes(legacy as never)
  await tagRoutes(legacy as never)
  await subscriptionRoutes(legacy as never)
  await statisticsRoutes(legacy as never)
  await calendarRoutes(legacy as never)
  await exchangeRateRoutes(legacy as never)
  await settingsRoutes(legacy as never)
  await notificationRoutes(legacy as never)
  await aiRoutes(legacy as never)
  await importRoutes(legacy as never)
}

const bootstrapPromise = bootstrapRoutes()

app.get('/health', (c) =>
  c.json({
    ok: true,
    timestamp: new Date().toISOString()
  })
)

app.get('/static/logos/:key{.+}', async (c) => {
  return serveStaticLogo(c.req.param('key'))
})

async function runWithContext(bindings: WorkerBindings, request: Request, execute: () => Promise<Response>) {
  await ensureDatabaseInitialized(bindings.DB)
  const prisma = getPrismaClient(bindings.DB)
  try {
    return await runWithRuntimeContext(
      {
        prisma,
        bindings,
        request
      },
      execute
    )
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}

export default {
  async fetch(request: Request, env: WorkerBindings, _ctx: ExecutionContext) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      await bootstrapPromise
      return app.fetch(request, env)
    }

    if (!requiresWorkerRuntimeContext(url.pathname)) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request)
      }

      return new Response('Asset binding not configured', { status: 404 })
    }

    return runWithContext(env, request, async () => {
      await bootstrapPromise
      if (requiresWorkerRuntimeContext(url.pathname)) {
        return app.fetch(request, env)
      }
      return new Response('Not found', { status: 404 })
    })
  },

  async scheduled(controller: ScheduledController, env: WorkerBindings, ctx: ExecutionContext) {
    const request = new Request('https://worker.local/__scheduled__')
    await runWithContext(env, request, async () => {
      await bootstrapPromise
      switch (controller.cron) {
        case env.CRON_REFRESH_RATES ?? '0 2 * * *':
          await refreshExchangeRates()
          break
        case env.CRON_SCAN ?? '* * * * *':
          await autoRenewDueSubscriptions()
          await scanRenewalNotifications()
          break
        default:
          break
      }

      return new Response('ok')
    })

    ctx.waitUntil(Promise.resolve())
  }
}
