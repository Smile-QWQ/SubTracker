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
})
