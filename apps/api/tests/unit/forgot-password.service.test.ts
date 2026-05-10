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
})
