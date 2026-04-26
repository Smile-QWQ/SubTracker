import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSettingMock, setSettingMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  setSettingMock: vi.fn()
}))

vi.mock('../../src/services/worker-lite-repository.service', () => ({
  getSettingLite: getSettingMock,
  setSettingLite: setSettingMock
}))

describe('cache version service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads numeric cache versions from settings storage', async () => {
    getSettingMock.mockResolvedValueOnce(42)
    const { getCacheVersion } = await import('../../src/services/cache-version.service')

    await expect(getCacheVersion('statistics')).resolves.toBe(42)
    expect(getSettingMock).toHaveBeenCalledWith('cacheVersion.statistics', 0)
  })

  it('writes one shared timestamp for each bumped namespace', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))

    const { bumpCacheVersions } = await import('../../src/services/cache-version.service')
    await bumpCacheVersions(['statistics', 'calendar', 'statistics'])

    expect(setSettingMock).toHaveBeenCalledTimes(2)
    expect(setSettingMock).toHaveBeenCalledWith('cacheVersion.statistics', 1777204800000)
    expect(setSettingMock).toHaveBeenCalledWith('cacheVersion.calendar', 1777204800000)

    vi.useRealTimers()
  })
})
