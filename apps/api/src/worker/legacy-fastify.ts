import { Hono } from 'hono'
import type { Context } from 'hono'
import { sendError } from '../http'
import { verifyToken } from '../services/auth.service'
import { getWorkerLogoBucket, getWorkerPublicConfig } from '../runtime'

type LegacyHandler = (request: Record<string, unknown>, reply: LegacyReply) => Promise<Response | unknown> | Response | unknown
type LegacyRouteOptions = {
  config?: {
    rateLimit?: {
      max: number
      timeWindow: number
    }
  }
}

class LegacyReply {
  private responseStatus = 200
  private headers = new Headers()

  status(code: number) {
    this.responseStatus = code
    return this
  }

  header(name: string, value: string) {
    this.headers.set(name, value)
    return this
  }

  send(payload: unknown) {
    return this.buildResponse(payload)
  }

  buildResponse(payload: unknown) {
    if (payload instanceof Response) {
      return payload
    }

    if (typeof payload === 'string') {
      return new Response(payload, {
        status: this.responseStatus,
        headers: this.headers
      })
    }

    this.headers.set('Content-Type', this.headers.get('Content-Type') ?? 'application/json; charset=utf-8')
    return new Response(JSON.stringify(payload), {
      status: this.responseStatus,
      headers: this.headers
    })
  }
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

async function parseRequestBody(c: Context) {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    return undefined
  }

  const contentType = c.req.header('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await c.req.json()
    } catch {
      return undefined
    }
  }

  try {
    const text = await c.req.text()
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

function getClientIp(c: Context) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0'
}

function enforceRateLimit(options: LegacyRouteOptions | undefined, c: Context) {
  const limit = options?.config?.rateLimit
  if (!limit) return null

  const key = `${c.req.path}:${getClientIp(c)}`
  const now = Date.now()
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + limit.timeWindow
    })
    return null
  }

  if (bucket.count >= limit.max) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  }

  bucket.count += 1
  rateLimitBuckets.set(key, bucket)
  return null
}

async function buildLegacyRequest(c: Context) {
  const url = new URL(c.req.url)
  const authorization = c.req.header('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
  const pathname = url.pathname
  const auth =
    pathname === '/api/v1/auth/login' ||
    pathname === '/api/v1/auth/login-options' ||
    pathname === '/health'
      ? undefined
      : await verifyToken(token)

  return {
    body: await parseRequestBody(c),
    query: Object.fromEntries(url.searchParams.entries()),
    params: c.req.param(),
    headers: Object.fromEntries(c.req.raw.headers.entries()),
    method: c.req.method,
    url: c.req.url,
    auth
  }
}

export class LegacyFastifyApp {
  constructor(private readonly app: Hono, private readonly prefix = '') {}

  get(path: string, ...handlers: Array<LegacyRouteOptions | LegacyHandler>) {
    this.addRoute('get', path, handlers)
  }

  post(path: string, ...handlers: Array<LegacyRouteOptions | LegacyHandler>) {
    this.addRoute('post', path, handlers)
  }

  put(path: string, ...handlers: Array<LegacyRouteOptions | LegacyHandler>) {
    this.addRoute('put', path, handlers)
  }

  patch(path: string, ...handlers: Array<LegacyRouteOptions | LegacyHandler>) {
    this.addRoute('patch', path, handlers)
  }

  delete(path: string, ...handlers: Array<LegacyRouteOptions | LegacyHandler>) {
    this.addRoute('delete', path, handlers)
  }

  private addRoute(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, handlers: Array<LegacyRouteOptions | LegacyHandler>) {
    const handler = handlers.at(-1)
    const options = (handlers.length > 1 ? handlers[0] : undefined) as LegacyRouteOptions | undefined

    if (typeof handler !== 'function') {
      throw new Error(`Invalid legacy handler for ${method.toUpperCase()} ${path}`)
    }

    this.app[method](`${this.prefix}${path}`, async (c) => {
      const retryAfterSeconds = enforceRateLimit(options, c)
      if (retryAfterSeconds) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'too_many_attempts',
              message: '登录失败次数过多，请稍后再试',
              details: {
                retryAfterSeconds
              }
            }
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json; charset=utf-8'
            }
          }
        )
      }

      const request = await buildLegacyRequest(c)
      if (
        c.req.path.startsWith('/api/v1') &&
        c.req.path !== '/api/v1/auth/login' &&
        c.req.path !== '/api/v1/auth/login-options' &&
        !(request as { auth?: unknown }).auth
      ) {
        const reply = new LegacyReply()
        return sendError(reply as never, 401, 'unauthorized', '请先登录')
      }

      const reply = new LegacyReply()
      try {
        const response = await (handler as LegacyHandler)(request, reply)
        return reply.buildResponse(response)
      } catch (error) {
        console.error('[worker-route-error]', {
          method: c.req.method,
          path: c.req.path,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
        return new Response(
          JSON.stringify({
            error: {
              code: 'internal_error',
              message: error instanceof Error ? error.message : 'Unknown server error'
            }
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json; charset=utf-8'
            }
          }
        )
      }
    })
  }
}

export async function serveStaticLogo(key: string) {
  const bucket = getWorkerLogoBucket()
  if (!bucket) {
    return new Response('Logo storage is disabled', { status: 404 })
  }

  const object = await bucket.get(key)
  if (!object) {
    return new Response('Logo not found', { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
}

export function buildWorkerInfo() {
  const publicConfig = getWorkerPublicConfig()
  return {
    logoStorageEnabled: Boolean(getWorkerLogoBucket()),
    cacheEnabled: typeof publicConfig.webOrigin === 'string'
  }
}
