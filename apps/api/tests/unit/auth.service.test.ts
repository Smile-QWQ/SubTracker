import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSettingMock = vi.fn()
const setSettingMock = vi.fn()

vi.mock('../../src/services/settings.service', () => ({
  getSetting: getSettingMock,
  setSetting: setSettingMock
}))

describe('auth service caching', () => {
  beforeEach(() => {
    vi.resetModules()
    getSettingMock.mockReset()
    setSettingMock.mockReset()
  })

  it('caches stored credentials in memory within the same process', async () => {
    const credentials = {
      username: 'admin',
      passwordHash: 'hash',
      passwordSalt: 'salt'
    }

    getSettingMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === 'authCredentials' ? credentials : fallback
    )

    const { getStoredCredentials } = await import('../../src/services/auth.service')

    await expect(getStoredCredentials()).resolves.toEqual(credentials)
    await expect(getStoredCredentials()).resolves.toEqual(credentials)

    expect(getSettingMock).toHaveBeenCalledTimes(1)
    expect(getSettingMock).toHaveBeenCalledWith('authCredentials', null)
  })

  it('caches session secret for repeated token signing', async () => {
    getSettingMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === 'authSessionSecret' ? 'secret-value' : fallback
    )

    const { issueToken } = await import('../../src/services/auth.service')

    await issueToken('admin')
    await issueToken('admin')

    expect(getSettingMock).toHaveBeenCalledTimes(1)
    expect(getSettingMock).toHaveBeenCalledWith('authSessionSecret', null)
  })

  it('resets password for the stored username and returns a new token', async () => {
    const credentials = {
      username: 'alice',
      passwordHash: 'hash',
      passwordSalt: 'salt'
    }

    getSettingMock.mockImplementation(async (key: string, fallback: unknown) => {
      if (key === 'authCredentials') return credentials
      if (key === 'authSessionSecret') return 'secret-value'
      return fallback
    })

    const { resetPasswordForStoredUsername, verifyToken } = await import('../../src/services/auth.service')

    const result = await resetPasswordForStoredUsername('alice', 'new-password')

    expect(result?.user.username).toBe('alice')
    expect(result?.user.mustChangePassword).toBe(false)
    expect(setSettingMock).toHaveBeenCalledWith(
      'authCredentials',
      expect.objectContaining({
        username: 'alice',
        passwordHash: expect.any(String),
        passwordSalt: expect.any(String)
      })
    )
    await expect(verifyToken(result?.token)).resolves.toMatchObject({
      username: 'alice'
    })
  })
})
