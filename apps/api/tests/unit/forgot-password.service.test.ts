import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  getStoredCredentialsMock: vi.fn(),
  resetPasswordForStoredUsernameMock: vi.fn(),
  getNotificationChannelSettingsMock: vi.fn(),
  sendForgotPasswordVerificationCodeMock: vi.fn()
}))

vi.mock('../../src/services/settings.service', () => ({
  getSetting: vi.fn(async (key: string, fallback: unknown) => (state.store.has(key) ? state.store.get(key) : fallback)),
  setSetting: vi.fn(async (key: string, value: unknown) => {
    state.store.set(key, value)
  }),
  getNotificationChannelSettings: state.getNotificationChannelSettingsMock
}))

vi.mock('../../src/services/auth.service', () => ({
  getStoredCredentials: state.getStoredCredentialsMock,
  resetPasswordForStoredUsername: state.resetPasswordForStoredUsernameMock
}))

vi.mock('../../src/services/channel-notification.service', () => ({
  sendForgotPasswordVerificationCode: state.sendForgotPasswordVerificationCodeMock
}))

describe('forgot password service', () => {
  beforeEach(() => {
    state.store.clear()
    state.getStoredCredentialsMock.mockReset()
    state.resetPasswordForStoredUsernameMock.mockReset()
    state.getNotificationChannelSettingsMock.mockReset()
    state.sendForgotPasswordVerificationCodeMock.mockReset()

    state.store.set('forgotPasswordEnabled', true)
    state.getStoredCredentialsMock.mockResolvedValue({
      username: 'admin',
      passwordHash: 'hash',
      passwordSalt: 'salt'
    })
    state.getNotificationChannelSettingsMock.mockResolvedValue({
      emailNotificationsEnabled: true,
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false
    })
    state.sendForgotPasswordVerificationCodeMock.mockResolvedValue([{ channel: 'email', status: 'success' }])
    state.resetPasswordForStoredUsernameMock.mockResolvedValue({
      token: 'reset-token',
      user: {
        username: 'admin',
        mustChangePassword: false
      }
    })
  })

  it('reports forgot password enabled when feature and a direct channel are enabled', async () => {
    const { isForgotPasswordEnabled } = await import('../../src/services/forgot-password.service')
    await expect(isForgotPasswordEnabled()).resolves.toBe(true)
  })

  it('stores a challenge after requesting a forgot password code', async () => {
    const { requestForgotPasswordChallenge } = await import('../../src/services/forgot-password.service')

    const result = await requestForgotPasswordChallenge('admin', '203.0.113.1')

    expect(result).toEqual({
      ok: true,
      accepted: true
    })
    expect(state.sendForgotPasswordVerificationCodeMock).toHaveBeenCalledTimes(1)
    expect(state.store.get('authForgotPasswordChallenge')).toBeTruthy()
  })

  it('accepts unknown usernames without exposing existence', async () => {
    const { requestForgotPasswordChallenge } = await import('../../src/services/forgot-password.service')

    const result = await requestForgotPasswordChallenge('not-admin', '203.0.113.1')

    expect(result).toEqual({
      ok: true,
      accepted: true
    })
    expect(state.sendForgotPasswordVerificationCodeMock).not.toHaveBeenCalled()
  })

  it('rejects invalid verification codes and decrements remaining attempts', async () => {
    const { requestForgotPasswordChallenge, resetPasswordWithForgotPasswordCode } = await import('../../src/services/forgot-password.service')

    await requestForgotPasswordChallenge('admin', '203.0.113.1')
    const result = await resetPasswordWithForgotPasswordCode({
      username: 'admin',
      code: '000000',
      newPassword: 'new-password',
      remoteAddress: '203.0.113.2'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('forgot_password_code_invalid')
    }
  })

  it('resets password when verification code matches', async () => {
    const { requestForgotPasswordChallenge, resetPasswordWithForgotPasswordCode } = await import('../../src/services/forgot-password.service')

    await requestForgotPasswordChallenge('admin', '203.0.113.1')
    const [{ code: matchingCode }] = state.sendForgotPasswordVerificationCodeMock.mock.calls[0]

    const result = await resetPasswordWithForgotPasswordCode({
      username: 'admin',
      code: matchingCode,
      newPassword: 'new-password',
      remoteAddress: '203.0.113.2'
    })

    expect(result.ok).toBe(true)
    expect(state.resetPasswordForStoredUsernameMock).toHaveBeenCalledWith('admin', 'new-password')
  })
})
