import Fastify from 'fastify'
import cors from '@fastify/cors'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config'
import { sendError } from './http'
import { authRoutes } from './routes/auth'
import { subscriptionRoutes } from './routes/subscriptions'
import { statisticsRoutes } from './routes/statistics'
import { calendarRoutes } from './routes/calendar'
import { exchangeRateRoutes } from './routes/exchange-rates'
import { settingsRoutes } from './routes/settings'
import { notificationRoutes } from './routes/notifications'
import { aiRoutes } from './routes/ai'
import { importRoutes } from './routes/imports'
import { tagRoutes } from './routes/tags'
import { verifyToken } from './services/auth.service'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'warn'
    }
  })

  await app.register(cors, {
    origin: config.webOrigin
  })

  app.get('/health', async () => ({ ok: true, timestamp: new Date().toISOString() }))

  app.get('/static/logos/:filename', async (request, reply) => {
    const filename = (request.params as { filename: string }).filename
    const safeName = path.basename(filename)
    const filePath = path.resolve(process.cwd(), 'apps/api/storage/logos', safeName)
    const ext = path.extname(safeName).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    }

    try {
      const file = await readFile(filePath)
      reply.header('Content-Type', mimeMap[ext] ?? 'application/octet-stream')
      return reply.send(file)
    } catch {
      return sendError(reply, 404, 'not_found', 'Logo not found')
    }
  })

  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0]
    if (
      request.method === 'OPTIONS' ||
      url === '/health' ||
      url.startsWith('/static/logos/') ||
      url === '/api/v1/auth/login' ||
      url === '/api/v1/auth/login-options'
    ) {
      return
    }

    const authorization = request.headers.authorization
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const user = await verifyToken(token)

    if (!user) {
      return sendError(reply, 401, 'unauthorized', '请先登录')
    }

    request.auth = user
  })

  await app.register(
    async (router) => {
      await authRoutes(router)
      await tagRoutes(router)
      await subscriptionRoutes(router)
      await statisticsRoutes(router)
      await calendarRoutes(router)
      await exchangeRateRoutes(router)
      await settingsRoutes(router)
      await notificationRoutes(router)
      await aiRoutes(router)
      await importRoutes(router)
    },
    { prefix: '/api/v1' }
  )

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    const message = error instanceof Error ? error.message : 'Unknown server error'
    return sendError(reply, 500, 'internal_error', message)
  })

  return app
}
