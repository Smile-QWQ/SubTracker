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

  it('caches stored credentials in memory within the same isolate', async () => {
    const credentials = {
      username: 'admin',
      passwordHash: 'hash',
      passwordSalt: 'salt',
      algorithm: 'worker-lite-sha256',
      mustChangePassword: true
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

  it('caches session secret in memory for repeated token signing', async () => {
    getSettingMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === 'authSessionSecret' ? 'secret-value' : fallback
    )

    const { issueToken } = await import('../../src/services/auth.service')

    await issueToken('admin')
    await issueToken('admin')

    expect(getSettingMock).toHaveBeenCalledTimes(1)
    expect(getSettingMock).toHaveBeenCalledWith('authSessionSecret', null)
  })

  it('normalizes legacy credentials with mustChangePassword metadata', async () => {
    const legacyCredentials = {
      username: 'admin',
      passwordHash: '25393607539e708876683a35a3ad7cb707d59120e2d98f151fa1ea34e07ee71874b8fd29a07b3e7774c7a2055465bfa20da3a43dc547410b9fe84ba94402bf62',
      passwordSalt: '487ac7cd1876f533c5d1d835a30c2761'
    }

    getSettingMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === 'authCredentials' ? legacyCredentials : fallback
    )

    const { getStoredCredentials } = await import('../../src/services/auth.service')
    const credentials = await getStoredCredentials()

    expect(credentials.algorithm).toBe('scrypt')
    expect(credentials.mustChangePassword).toBe(true)
    expect(setSettingMock).toHaveBeenCalledWith(
      'authCredentials',
      expect.objectContaining({
        username: 'admin',
        algorithm: 'scrypt',
        mustChangePassword: true
      })
    )
  })

  it('migrates successful legacy login to lite hash without keeping mustChangePassword false-positive', async () => {
    const legacyCredentials = {
      username: 'admin',
      passwordHash: '25393607539e708876683a35a3ad7cb707d59120e2d98f151fa1ea34e07ee71874b8fd29a07b3e7774c7a2055465bfa20da3a43dc547410b9fe84ba94402bf62',
      passwordSalt: '487ac7cd1876f533c5d1d835a30c2761'
    }

    getSettingMock.mockImplementation(async (key: string, fallback: unknown) => {
      if (key === 'authCredentials') return legacyCredentials
      if (key === 'authSessionSecret') return 'secret-value'
      return fallback
    })

    const { loginWithCredentials } = await import('../../src/services/auth.service')
    const result = await loginWithCredentials('admin', 'admin')

    expect(result?.user.mustChangePassword).toBe(true)
    expect(setSettingMock).toHaveBeenCalledWith(
      'authCredentials',
      expect.objectContaining({
        username: 'admin',
        algorithm: 'worker-lite-sha256',
        mustChangePassword: true
      })
    )
  })
})
