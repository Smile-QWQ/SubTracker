import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { registerWorkerRoutes } from '../../src/worker/index'

describe('worker route bootstrap', () => {
  it('registers app locale routes for worker runtime', async () => {
    const app = new Hono()

    await registerWorkerRoutes(app)

    const routes = (app as Hono & {
      routes?: Array<{ path: string; method: string }>
    }).routes ?? []

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/v1/app/locale' }),
        expect.objectContaining({ method: 'PUT', path: '/api/v1/app/locale' })
      ])
    )
  })
})
