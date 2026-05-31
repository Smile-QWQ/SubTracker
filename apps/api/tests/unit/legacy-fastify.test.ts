import { zipSync, strFromU8, unzipSync } from 'fflate'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LegacyFastifyApp } from '../../src/worker/legacy-fastify'

const authState = vi.hoisted(() => ({
  verifyTokenMock: vi.fn()
}))

vi.mock('../../src/services/auth.service', () => ({
  verifyToken: authState.verifyTokenMock
}))

describe('LegacyFastifyApp', () => {
  beforeEach(() => {
    authState.verifyTokenMock.mockReset()
    authState.verifyTokenMock.mockResolvedValue(null)
  })

  it('preserves binary payloads instead of JSON stringifying them', async () => {
    const app = new Hono()
    const legacy = new LegacyFastifyApp(app, '/worker')
    const manifest = {
      app: 'SubTracker'
    }

    legacy.get('/backup', async (_request, reply) => {
      const archive = Buffer.from(
        zipSync({
          'manifest.json': new TextEncoder().encode(JSON.stringify(manifest))
        })
      )
      reply.header('Content-Type', 'application/zip')
      return reply.send(archive)
    })

    const response = await app.request('http://localhost/worker/backup')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/zip')

    const body = new Uint8Array(await response.arrayBuffer())
    const entries = unzipSync(body)
    expect(strFromU8(entries['manifest.json'])).toContain('SubTracker')
  })

  it('still serializes object payloads as json', async () => {
    const app = new Hono()
    const legacy = new LegacyFastifyApp(app, '/worker')

    legacy.get('/json', async (_request, reply) => {
      return reply.send({
        ok: true
      })
    })

    const response = await app.request('http://localhost/worker/json')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      ok: true
    })
  })

  it('allows anonymous GET access to app locale like the main runtime', async () => {
    const app = new Hono()
    const legacy = new LegacyFastifyApp(app, '/api/v1')

    legacy.get('/app/locale', async (_request, reply) => {
      return reply.send({
        data: {
          locale: 'en-US'
        }
      })
    })

    const response = await app.request('http://localhost/api/v1/app/locale')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        locale: 'en-US'
      }
    })
    expect(authState.verifyTokenMock).not.toHaveBeenCalled()
  })
})
