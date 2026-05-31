import { FastifyInstance } from 'fastify'
import { ChangeCredentialsSchema, ForgotPasswordRequestSchema, ForgotPasswordResetSchema, LoginSchema } from '@subtracker/shared'
import { z } from 'zod'
import { sendError, sendOk } from '../http'
import { changeCredentials, changeDefaultPassword, loginWithCredentials } from '../services/auth.service'
import { getRememberSessionDays } from '../services/settings.service'
import {
  isForgotPasswordEnabled,
  requestForgotPasswordChallenge,
  resetPasswordWithForgotPasswordCode
} from '../services/forgot-password.service'

function resolveLoginValidationMessage(body: unknown) {
  const payload = (body ?? {}) as Partial<{ username: string; password: string }>
  const username = payload.username?.trim() ?? ''
  const password = payload.password?.trim() ?? ''

  if (!username && !password) return 'auth.validation.usernameAndPasswordRequired'
  if (!username) return 'auth.validation.usernameRequired'
  if (!password) return 'auth.validation.passwordRequired'
  return 'auth.validation.loginPayloadInvalid'
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/login-options', async (_request, reply) => {
    return sendOk(reply, {
      rememberSessionDays: await getRememberSessionDays(),
      forgotPasswordEnabled: await isForgotPasswordEnabled()
    })
  })

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 10 * 60 * 1000
        }
      }
    },
    async (request, reply) => {
      const parsed = LoginSchema.safeParse(request.body)
      if (!parsed.success) {
        return sendError(reply, 422, 'validation_error', resolveLoginValidationMessage(request.body), parsed.error.flatten())
      }

      const result = await loginWithCredentials(parsed.data.username, parsed.data.password, {
        rememberMe: parsed.data.rememberMe,
        rememberDays: parsed.data.rememberDays
      })
      if (!result) {
        return sendError(reply, 401, 'invalid_credentials', 'api.errors.auth.invalidCredentials')
      }

      return sendOk(reply, result)
    }
  )

  app.get('/auth/me', async (request, reply) => {
    if (!request.auth) {
      return sendError(reply, 401, 'unauthorized', 'api.errors.unauthorized')
    }

    return sendOk(reply, {
      user: request.auth
    })
  })

  app.post('/auth/change-credentials', async (request, reply) => {
    const parsed = ChangeCredentialsSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidCredentialsPayload', parsed.error.flatten())
    }

    const result = await changeCredentials(parsed.data)
    if (!result) {
      return sendError(reply, 401, 'invalid_credentials', 'api.errors.auth.currentCredentialsInvalid')
    }

    return sendOk(reply, result)
  })

  app.post('/auth/change-default-password', async (request, reply) => {
    const parsed = z
      .object({
        newPassword: z.string().min(4).max(200)
      })
      .safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidPasswordPayload', parsed.error.flatten())
    }

    const result = await changeDefaultPassword(parsed.data.newPassword)
    if (!result) {
      return sendError(reply, 400, 'default_password_change_not_allowed', 'api.errors.auth.defaultPasswordChangeNotAllowed')
    }

    return sendOk(reply, result)
  })

  app.post(
    '/auth/forgot-password/request',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 10 * 60 * 1000
        }
      }
    },
    async (request, reply) => {
      const parsed = ForgotPasswordRequestSchema.safeParse(request.body)
      if (!parsed.success) {
        return sendError(
          reply,
          422,
          'validation_error',
          'api.errors.validation.invalidForgotPasswordRequestPayload',
          parsed.error.flatten()
        )
      }

      const result = await requestForgotPasswordChallenge(parsed.data.username, request.ip, request.locale)
      if (!result.ok) {
        return sendError(reply, result.error.status, result.error.code, result.error.message, {
          retryAfterSeconds: result.error.retryAfterSeconds
        })
      }

      return sendOk(reply, { accepted: true })
    }
  )

  app.post(
    '/auth/forgot-password/reset',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 10 * 60 * 1000
        }
      }
    },
    async (request, reply) => {
      const parsed = ForgotPasswordResetSchema.safeParse(request.body)
      if (!parsed.success) {
        return sendError(
          reply,
          422,
          'validation_error',
          'api.errors.validation.invalidForgotPasswordResetPayload',
          parsed.error.flatten()
        )
      }

      const result = await resetPasswordWithForgotPasswordCode({
        ...parsed.data,
        remoteAddress: request.ip,
        locale: request.locale
      })

      if (!result.ok) {
        return sendError(reply, result.error.status, result.error.code, result.error.message, {
          retryAfterSeconds: result.error.retryAfterSeconds
        })
      }

      return sendOk(reply, result.result)
    }
  )
}
