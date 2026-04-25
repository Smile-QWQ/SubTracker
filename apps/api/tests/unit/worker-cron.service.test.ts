import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingsState = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => settingsState)

describe('worker cron daily gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs only once per business day when the local hour matches', async () => {
    const { runDailyTaskAtLocalHour } = await import('../../src/services/worker-cron.service')
    settingsState.getSetting.mockResolvedValueOnce(null)
    const execute = vi.fn(async () => undefined)

    await expect(
      runDailyTaskAtLocalHour('refreshExchangeRates', 'Asia/Shanghai', 2, new Date('2026-04-25T18:00:00.000Z'), execute)
    ).resolves.toBe(true)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(settingsState.setSetting).toHaveBeenCalledWith(
      '__worker_cron_last_run:refreshExchangeRates:Asia/Shanghai',
      '2026-04-26'
    )
  })

  it('skips execution when the task already ran for the local business day', async () => {
    const { runDailyTaskAtLocalHour } = await import('../../src/services/worker-cron.service')
    settingsState.getSetting.mockResolvedValueOnce('2026-04-26')
    const execute = vi.fn(async () => undefined)

    await expect(
      runDailyTaskAtLocalHour('reconcileExpiredSubscriptions', 'Asia/Shanghai', 2, new Date('2026-04-25T18:10:00.000Z'), execute)
    ).resolves.toBe(false)

    expect(execute).not.toHaveBeenCalled()
    expect(settingsState.setSetting).not.toHaveBeenCalled()
  })

  it('skips execution when the local hour does not match the configured target hour', async () => {
    const { runDailyTaskAtLocalHour } = await import('../../src/services/worker-cron.service')
    const execute = vi.fn(async () => undefined)

    await expect(
      runDailyTaskAtLocalHour('refreshExchangeRates', 'Asia/Shanghai', 2, new Date('2026-04-25T17:00:00.000Z'), execute)
    ).resolves.toBe(false)

    expect(settingsState.getSetting).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
