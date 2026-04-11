import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app'

describe('api health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should return health status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const payload = res.json()
    expect(payload.ok).toBe(true)
  })
})
