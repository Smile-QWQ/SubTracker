import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  loginWithCredentialsMock: vi.fn(),
  changeCredentialsMock: vi.fn(),
  changeDefaultPasswordMock: vi.fn(),
  getRememberSessionDaysMock: vi.fn(async () => 7)
}))

vi.mock('../../src/services/settings.service', () => ({
  getRememberSessionDays: authMocks.getRememberSessionDaysMock
}))

vi.mock('../../src/services/auth.service', () => ({
  loginWithCredentials: authMocks.loginWithCredentialsMock,
  changeCredentials: authMocks.changeCredentialsMock,
  changeDefaultPassword: authMocks.changeDefaultPasswordMock
}))

import { authRoutes } from '../../src/routes/auth'

describe('auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: {
          code: 'too_many_attempts',
          message: '登录失败次数过多，请稍后再试',
          details: {
            retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000))
          }
        }
      })
    })
    await authRoutes(app)
    authMocks.loginWithCredentialsMock.mockReset()
    authMocks.changeCredentialsMock.mockReset()
    authMocks.changeDefaultPasswordMock.mockReset()
    authMocks.getRememberSessionDaysMock.mockClear()
    authMocks.loginWithCredentialsMock.mockResolvedValue(null)
    authMocks.changeCredentialsMock.mockResolvedValue(null)
    authMocks.changeDefaultPasswordMock.mockResolvedValue(null)
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

  it('returns mustChangePassword in login response', async () => {
    authMocks.loginWithCredentialsMock.mockResolvedValue({
      token: 'token',
      user: {
        username: 'admin',
        mustChangePassword: true
      }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.user.mustChangePassword).toBe(true)
  })

  it('uses the narrow remember-session getter for login options', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/login-options'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.rememberSessionDays).toBe(7)
    expect(authMocks.getRememberSessionDaysMock).toHaveBeenCalledTimes(1)
  })

  it('blocks repeated failed login attempts with rate limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          username: 'admin',
          password: 'wrong-password'
        },
        remoteAddress: '203.0.113.10'
      })

      expect(res.statusCode).toBe(401)
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'admin',
        password: 'wrong-password'
      },
      remoteAddress: '203.0.113.10'
    })

    expect(limited.statusCode).toBe(429)
    expect(limited.json().error.code).toBe('too_many_attempts')
  })

  it('allows changing default password with a dedicated endpoint', async () => {
    authMocks.changeDefaultPasswordMock.mockResolvedValue({
      token: 'new-token',
      user: {
        username: 'admin',
        mustChangePassword: false
      }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/change-default-password',
      payload: {
        newPassword: 'new-password'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.user.mustChangePassword).toBe(false)
  })
})
