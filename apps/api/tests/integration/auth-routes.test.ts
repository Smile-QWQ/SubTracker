import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => ({
    rememberSessionDays: 7
  }))
}))

vi.mock('../../src/services/auth.service', () => ({
  loginWithCredentials: vi.fn(async () => null),
  changeCredentials: vi.fn(async () => null)
}))

import { authRoutes } from '../../src/routes/auth'

describe('auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await authRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns a friendly validation message when username or password is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: '',
        password: ''
      }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toBe('请输入用户名和密码')
  })
})
