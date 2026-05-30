import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getCacheVersionMock,
  getSettingLiteMock,
  listSettingsLiteMock,
  withWorkerLiteCacheMock
} = vi.hoisted(() => ({
  getCacheVersionMock: vi.fn(),
  getSettingLiteMock: vi.fn(),
  listSettingsLiteMock: vi.fn(),
  withWorkerLiteCacheMock: vi.fn()
}))

vi.mock('@subtracker/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual
  }
})

vi.mock('../../src/config', () => ({
  config: {
    baseCurrency: 'CNY',
    defaultNotifyDays: 3,
    resendApiUrl: 'https://api.resend.com',
    defaultAppLocale: 'zh-CN'
  }
}))

vi.mock('../../src/runtime', () => ({
  getWorkerLogoBucket: vi.fn(() => undefined)
}))

vi.mock('../../src/services/cache-version.service', () => ({
  getCacheVersion: getCacheVersionMock
}))

vi.mock('../../src/services/worker-lite-cache.service', () => ({
  invalidateWorkerLiteCache: vi.fn(),
  withWorkerLiteCache: withWorkerLiteCacheMock
}))

vi.mock('../../src/services/worker-lite-repository.service', () => ({
  getSettingLite: getSettingLiteMock,
  listSettingsLite: listSettingsLiteMock,
  setSettingLite: vi.fn()
}))

describe('settings service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getCacheVersionMock.mockResolvedValue(7)
    getSettingLiteMock.mockImplementation(async (_key: string, fallback: unknown) => fallback)
    listSettingsLiteMock.mockResolvedValue(new Map())
    withWorkerLiteCacheMock.mockImplementation(async (_namespace: string, _cacheKey: string, loader: () => Promise<unknown>) => loader())
  })

  it('versions single-setting cache entries by settings cache version', async () => {
    const { getSetting } = await import('../../src/services/settings.service')

    await getSetting('baseCurrency', 'CNY')

    expect(getCacheVersionMock).toHaveBeenCalledWith('settings')
    expect(withWorkerLiteCacheMock).toHaveBeenCalledWith(
      'settings',
      'setting:baseCurrency:v7',
      expect.any(Function),
      30
    )
  })

  it('versions aggregated app settings cache entries by settings cache version', async () => {
    withWorkerLiteCacheMock.mockResolvedValueOnce({})
    const { getAppSettings } = await import('../../src/services/settings.service')

    await getAppSettings()

    expect(getCacheVersionMock).toHaveBeenCalledWith('settings')
    expect(withWorkerLiteCacheMock).toHaveBeenCalledWith(
      'settings',
      'app-settings:v7',
      expect.any(Function),
      30
    )
  })

  it('reads app timezone through single-setting cache instead of full settings aggregation', async () => {
    getSettingLiteMock.mockResolvedValueOnce('Asia/Tokyo')
    const { getAppTimezone } = await import('../../src/services/settings.service')

    await expect(getAppTimezone()).resolves.toBe('Asia/Tokyo')

    expect(getCacheVersionMock).toHaveBeenCalledWith('settings')
    expect(withWorkerLiteCacheMock).toHaveBeenCalledWith(
      'settings',
      'setting:timezone:v7',
      expect.any(Function),
      30
    )
    expect(listSettingsLiteMock).not.toHaveBeenCalled()
  })

  it('reads forgot password toggle from stored settings', async () => {
    listSettingsLiteMock.mockResolvedValue(
      new Map<string, unknown>([
        ['forgotPasswordEnabled', true],
        ['emailNotificationsEnabled', true],
        ['emailProvider', 'resend'],
        [
          'resendConfig',
          {
            apiBaseUrl: 'https://api.resend.com',
            apiKey: 'token',
            from: 'noreply@example.com',
            to: 'user@example.com'
          }
        ]
      ])
    )

    const { getAppSettings } = await import('../../src/services/settings.service')
    const result = await getAppSettings()

    expect(result.forgotPasswordEnabled).toBe(true)
  })
})
