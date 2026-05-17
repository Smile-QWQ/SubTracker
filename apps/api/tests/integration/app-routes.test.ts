import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { config } from '../../src/config'

const appRouteMocks = vi.hoisted(() => ({
  verifyTokenMock: vi.fn(),
  getResolvedAppLocaleMock: vi.fn(async () => 'en-US'),
  setAppLocaleMock: vi.fn(async (locale: 'zh-CN' | 'en-US') => locale)
}))

vi.mock('../../src/services/auth.service', () => ({
  verifyToken: appRouteMocks.verifyTokenMock
}))

vi.mock('../../src/db', () => ({
  prisma: {
    settings: {
      findMany: vi.fn(),
      upsert: vi.fn()
    }
  }
}))

vi.mock('../../src/services/settings.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/settings.service')>('../../src/services/settings.service')
  return {
    ...actual,
    getResolvedAppLocale: appRouteMocks.getResolvedAppLocaleMock,
    setAppLocale: appRouteMocks.setAppLocaleMock
  }
})

import { buildApp } from '../../src/app'

describe('app locale routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('allows public GET /api/v1/app/locale', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/app/locale'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.locale).toBe('en-US')
  })

  it('falls back to DEFAULT_APP_LOCALE when no stored locale exists', async () => {
    const previousDefaultLocale = config.defaultAppLocale
    appRouteMocks.getResolvedAppLocaleMock.mockResolvedValueOnce(previousDefaultLocale)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/app/locale'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.locale).toBe(previousDefaultLocale)
  })

  it('rejects unauthenticated PUT /api/v1/app/locale', async () => {
    appRouteMocks.verifyTokenMock.mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/app/locale',
      payload: {
        locale: 'zh-CN'
      }
    })

    expect(res.statusCode).toBe(401)
  })

  it('allows authenticated PUT /api/v1/app/locale', async () => {
    appRouteMocks.verifyTokenMock.mockResolvedValueOnce({
      username: 'admin',
      mustChangePassword: false
    })

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/app/locale',
      headers: {
        authorization: 'Bearer token'
      },
      payload: {
        locale: 'zh-CN'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.locale).toBe('zh-CN')
    expect(appRouteMocks.setAppLocaleMock).toHaveBeenCalledWith('zh-CN')
  })
})
