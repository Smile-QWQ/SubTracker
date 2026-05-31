import { createHash, randomInt } from 'node:crypto'
import { DEFAULT_APP_LOCALE, getMessage, type AppLocale } from '@subtracker/shared'
import { getNotificationChannelSettings, getSetting, setSetting } from './settings.service'
import { getStoredCredentials, resetPasswordForStoredUsername } from './auth.service'
import { sendForgotPasswordVerificationCode } from './channel-notification.service'

const FORGOT_PASSWORD_CHALLENGE_KEY = 'authForgotPasswordChallenge'
const FORGOT_PASSWORD_IP_REQUEST_PREFIX = 'authForgotPasswordIpRequest'
const FORGOT_PASSWORD_IP_RESET_PREFIX = 'authForgotPasswordIpReset'
const REQUEST_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const REQUEST_RATE_LIMIT_MAX = 3
const RESET_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RESET_RATE_LIMIT_MAX = 5
const CHALLENGE_TTL_MS = 10 * 60 * 1000
const CHALLENGE_MAX_ATTEMPTS = 5
const REQUEST_COOLDOWN_MS = 60 * 1000

type StoredForgotPasswordChallenge = {
  username: string
  codeHash: string
  expiresAt: number
  attemptsRemaining: number
  requestedAt: number
}

type StoredRateLimitRecord = {
  count: number
  windowStartedAt: number
}

function hashVerificationCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

function buildRateLimitKey(prefix: string, remoteAddress: string) {
  return `${prefix}:${remoteAddress || 'unknown'}`
}

function resolveForgotPasswordLocale(locale?: AppLocale) {
  return locale ?? DEFAULT_APP_LOCALE
}

async function consumeRateLimit(prefix: string, remoteAddress: string, max: number, windowMs: number) {
  const key = buildRateLimitKey(prefix, remoteAddress)
  const now = Date.now()
  const existing = await getSetting<StoredRateLimitRecord | null>(key, null)

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    await setSetting(key, {
      count: 1,
      windowStartedAt: now
    })
    return null
  }

  if (existing.count >= max) {
    return Math.max(1, Math.ceil((existing.windowStartedAt + windowMs - now) / 1000))
  }

  await setSetting(key, {
    count: existing.count + 1,
    windowStartedAt: existing.windowStartedAt
  })
  return null
}

export async function isForgotPasswordEnabled() {
  const featureEnabled = await getSetting('forgotPasswordEnabled', false)
  if (!featureEnabled) {
    return false
  }

  const settings = await getNotificationChannelSettings()
  return Boolean(
    settings.emailNotificationsEnabled ||
      settings.pushplusNotificationsEnabled ||
      settings.telegramNotificationsEnabled ||
      settings.serverchanNotificationsEnabled ||
      settings.gotifyNotificationsEnabled
  )
}

function generateVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

async function getStoredChallenge() {
  const challenge = await getSetting<StoredForgotPasswordChallenge | null>(FORGOT_PASSWORD_CHALLENGE_KEY, null)
  if (!challenge) return null

  if (challenge.expiresAt < Date.now()) {
    await clearForgotPasswordChallenge()
    return null
  }

  return challenge
}

export async function clearForgotPasswordChallenge() {
  await setSetting(FORGOT_PASSWORD_CHALLENGE_KEY, null)
}

export async function requestForgotPasswordChallenge(username: string, remoteAddress: string, locale?: AppLocale) {
  const resolvedLocale = resolveForgotPasswordLocale(locale)

  if (!(await isForgotPasswordEnabled())) {
    return {
      ok: false as const,
      error: {
        status: 403,
        code: 'forgot_password_disabled',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordDisabled')
      }
    }
  }

  const retryAfterSeconds = await consumeRateLimit(
    FORGOT_PASSWORD_IP_REQUEST_PREFIX,
    remoteAddress,
    REQUEST_RATE_LIMIT_MAX,
    REQUEST_RATE_LIMIT_WINDOW_MS
  )

  if (retryAfterSeconds) {
    return {
      ok: false as const,
      error: {
        status: 429,
        code: 'forgot_password_request_rate_limited',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordRequestRateLimited'),
        retryAfterSeconds
      }
    }
  }

  const credentials = await getStoredCredentials()
  if (credentials.username !== username.trim()) {
    return {
      ok: true as const,
      accepted: true
    }
  }

  const existingChallenge = await getStoredChallenge()
  if (existingChallenge && existingChallenge.username === credentials.username) {
    const remainingCooldownMs = existingChallenge.requestedAt + REQUEST_COOLDOWN_MS - Date.now()
    if (remainingCooldownMs > 0) {
      return {
        ok: false as const,
        error: {
          status: 429,
          code: 'forgot_password_request_cooldown',
          message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordRequestCooldown'),
          retryAfterSeconds: Math.max(1, Math.ceil(remainingCooldownMs / 1000))
        }
      }
    }
  }

  const code = generateVerificationCode()
  const dispatchResults = await sendForgotPasswordVerificationCode({
    username: credentials.username,
    code,
    expiresInMinutes: CHALLENGE_TTL_MS / 60_000
  })

  if (!dispatchResults.some((item) => item.status === 'success')) {
    return {
      ok: false as const,
      error: {
        status: 400,
        code: 'forgot_password_delivery_failed',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordDeliveryFailed')
      }
    }
  }

  await setSetting(FORGOT_PASSWORD_CHALLENGE_KEY, {
    username: credentials.username,
    codeHash: hashVerificationCode(code),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    attemptsRemaining: CHALLENGE_MAX_ATTEMPTS,
    requestedAt: Date.now()
  } satisfies StoredForgotPasswordChallenge)

  return {
    ok: true as const,
    accepted: true
  }
}

export async function resetPasswordWithForgotPasswordCode(input: {
  username: string
  code: string
  newPassword: string
  remoteAddress: string
  locale?: AppLocale
}) {
  const resolvedLocale = resolveForgotPasswordLocale(input.locale)

  if (!(await isForgotPasswordEnabled())) {
    return {
      ok: false as const,
      error: {
        status: 403,
        code: 'forgot_password_disabled',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordDisabled')
      }
    }
  }

  const retryAfterSeconds = await consumeRateLimit(
    FORGOT_PASSWORD_IP_RESET_PREFIX,
    input.remoteAddress,
    RESET_RATE_LIMIT_MAX,
    RESET_RATE_LIMIT_WINDOW_MS
  )

  if (retryAfterSeconds) {
    return {
      ok: false as const,
      error: {
        status: 429,
        code: 'forgot_password_reset_rate_limited',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordResetRateLimited'),
        retryAfterSeconds
      }
    }
  }

  const credentials = await getStoredCredentials()
  const challenge = await getStoredChallenge()

  if (!challenge || challenge.username !== credentials.username || credentials.username !== input.username.trim()) {
    return {
      ok: false as const,
      error: {
        status: 400,
        code: 'forgot_password_challenge_not_found',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordChallengeNotFound')
      }
    }
  }

  if (challenge.attemptsRemaining <= 0) {
    await clearForgotPasswordChallenge()
    return {
      ok: false as const,
      error: {
        status: 400,
        code: 'forgot_password_attempts_exhausted',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordAttemptsExhausted')
      }
    }
  }

  if (hashVerificationCode(input.code) !== challenge.codeHash) {
    const nextAttempts = challenge.attemptsRemaining - 1
    if (nextAttempts <= 0) {
      await clearForgotPasswordChallenge()
    } else {
      await setSetting(FORGOT_PASSWORD_CHALLENGE_KEY, {
        ...challenge,
        attemptsRemaining: nextAttempts
      } satisfies StoredForgotPasswordChallenge)
    }

    return {
      ok: false as const,
      error: {
        status: 400,
        code: 'forgot_password_code_invalid',
        message:
          nextAttempts > 0
            ? getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordCodeInvalidWithAttempts', { attempts: nextAttempts })
            : getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordCodeInvalid')
      }
    }
  }

  const authResult = await resetPasswordForStoredUsername(credentials.username, input.newPassword)
  if (!authResult) {
    return {
      ok: false as const,
      error: {
        status: 400,
        code: 'forgot_password_reset_failed',
        message: getMessage(resolvedLocale, 'api.errors.auth.forgotPasswordResetFailed')
      }
    }
  }

  await clearForgotPasswordChallenge()

  return {
    ok: true as const,
    result: authResult
  }
}
