import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_APP_LOCALE } from '@subtracker/shared'
import { getMessage } from '@subtracker/shared'
import { config } from './config'
import { sendError } from './http'
import { detectRequestLocale } from './i18n'
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
import { versionRoutes } from './routes/version'
import { appRoutes } from './routes/app'
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

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: {
        code: 'too_many_attempts',
        message: getMessage(request.locale ?? DEFAULT_APP_LOCALE, 'api.errors.tooManyAttempts'),
        details: {
          retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000))
        }
      }
    })
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
      return sendError(reply, 404, 'not_found', 'api.errors.logoNotFound', undefined, {
        locale: request.locale ?? DEFAULT_APP_LOCALE
      })
    }
  })

  app.addHook('onRequest', async (request, reply) => {
    request.locale = detectRequestLocale(request)
    const url = request.url.split('?')[0]
    const isPublicRoute =
      request.method === 'OPTIONS' ||
      url === '/health' ||
      url.startsWith('/static/logos/') ||
      url === '/api/v1/auth/login' ||
      url === '/api/v1/auth/login-options' ||
      url === '/api/v1/auth/forgot-password/request' ||
      url === '/api/v1/auth/forgot-password/reset' ||
      url === '/api/v1/version/updates' ||
      (request.method === 'GET' && url === '/api/v1/app/locale')

    if (isPublicRoute) {
      return
    }

    const authorization = request.headers.authorization
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const user = await verifyToken(token)

    if (!user) {
      return sendError(reply, 401, 'unauthorized', 'api.errors.unauthorized', undefined, {
        locale: request.locale
      })
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
      await appRoutes(router)
      await versionRoutes(router)
    },
    { prefix: '/api/v1' }
  )

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    return sendError(reply, 500, 'internal_error', 'api.errors.internal', undefined, {
      locale: _request.locale ?? DEFAULT_APP_LOCALE
    })
  })

  return app
}
