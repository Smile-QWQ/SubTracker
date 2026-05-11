import { beforeEach, describe, expect, it, vi } from 'vitest'

const forgotPasswordState = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  setSettingMock: vi.fn(),
  getNotificationChannelSettingsMock: vi.fn(),
  getStoredCredentialsMock: vi.fn(),
  resetPasswordForStoredUsernameMock: vi.fn(),
  sendForgotPasswordVerificationCodeMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getSetting: forgotPasswordState.getSettingMock,
  setSetting: forgotPasswordState.setSettingMock,
  getNotificationChannelSettings: forgotPasswordState.getNotificationChannelSettingsMock
}))

vi.mock('../../src/services/auth.service', () => ({
  getStoredCredentials: forgotPasswordState.getStoredCredentialsMock,
  resetPasswordForStoredUsername: forgotPasswordState.resetPasswordForStoredUsernameMock
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  sendForgotPasswordVerificationCode: forgotPasswordState.sendForgotPasswordVerificationCodeMock
}))

describe('forgot password service', () => {
  beforeEach(() => {
    vi.resetModules()
    forgotPasswordState.getSettingMock.mockReset()
    forgotPasswordState.setSettingMock.mockReset()
    forgotPasswordState.getNotificationChannelSettingsMock.mockReset()
    forgotPasswordState.getStoredCredentialsMock.mockReset()
    forgotPasswordState.resetPasswordForStoredUsernameMock.mockReset()
    forgotPasswordState.sendForgotPasswordVerificationCodeMock.mockReset()
  })

  it('requires explicit forgot-password switch in addition to direct channels', async () => {
    forgotPasswordState.getSettingMock.mockImplementation(async (_key: string, fallback: unknown) => fallback)
    forgotPasswordState.getNotificationChannelSettingsMock.mockResolvedValue({
      emailNotificationsEnabled: true,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })

    const { isForgotPasswordEnabled } = await import('../../src/services/forgot-password.service')
    await expect(isForgotPasswordEnabled()).resolves.toBe(false)
  })

  it('enables forgot-password only when switch is on and at least one direct channel is enabled', async () => {
    forgotPasswordState.getSettingMock.mockImplementation(async (key: string, fallback: unknown) =>
      key === 'forgotPasswordEnabled' ? true : fallback
    )
    forgotPasswordState.getNotificationChannelSettingsMock.mockResolvedValue({
      emailNotificationsEnabled: false,
      pushplusNotificationsEnabled: true,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })

    const { isForgotPasswordEnabled } = await import('../../src/services/forgot-password.service')
    await expect(isForgotPasswordEnabled()).resolves.toBe(true)
  })

  it('passes locale to forgot-password notification dispatch', async () => {
    const store = new Map<string, unknown>([['forgotPasswordEnabled', true]])
    forgotPasswordState.getSettingMock.mockImplementation(async (key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback
    )
    forgotPasswordState.setSettingMock.mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value)
    })
    forgotPasswordState.getNotificationChannelSettingsMock.mockResolvedValue({
      emailNotificationsEnabled: true,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })
    forgotPasswordState.getStoredCredentialsMock.mockResolvedValue({
      username: 'admin',
      passwordHash: 'hash',
      passwordSalt: 'salt'
    })
    forgotPasswordState.sendForgotPasswordVerificationCodeMock.mockResolvedValue([
      { channel: 'email', status: 'success' }
    ])

    const { requestForgotPasswordChallenge } = await import('../../src/services/forgot-password.service')
    const result = await requestForgotPasswordChallenge('admin', '127.0.0.1', 'en-US')

    expect(result.ok).toBe(true)
    expect(forgotPasswordState.sendForgotPasswordVerificationCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'admin'
      }),
      { locale: 'en-US' }
    )
  })
})
