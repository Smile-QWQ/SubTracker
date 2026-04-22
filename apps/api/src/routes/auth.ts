import { FastifyInstance } from 'fastify'
import { ChangeCredentialsSchema, LoginSchema } from '@subtracker/shared'
import { z } from 'zod'
import { sendError, sendOk } from '../http'
import { changeCredentials, changeDefaultPassword, loginWithCredentials } from '../services/auth.service'
import { getRememberSessionDays } from '../services/settings.service'

function resolveLoginValidationMessage(body: unknown) {
  const payload = (body ?? {}) as Partial<{ username: string; password: string }>
  const username = payload.username?.trim() ?? ''
  const password = payload.password?.trim() ?? ''

  if (!username && !password) return '请输入用户名和密码'
  if (!username) return '请输入用户名'
  if (!password) return '请输入密码'
  return '登录信息格式不正确'
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/login-options', async (_request, reply) => {
    return sendOk(reply, {
      rememberSessionDays: await getRememberSessionDays()
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
        return sendError(reply, 401, 'invalid_credentials', '用户名或密码错误')
      }

      return sendOk(reply, result)
    }
  )

  app.get('/auth/me', async (request, reply) => {
    if (!request.auth) {
      return sendError(reply, 401, 'unauthorized', '请先登录')
    }

    return sendOk(reply, {
      user: request.auth
    })
  })

  app.post('/auth/change-credentials', async (request, reply) => {
    const parsed = ChangeCredentialsSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid credentials payload', parsed.error.flatten())
    }

    const result = await changeCredentials(parsed.data)
    if (!result) {
      return sendError(reply, 401, 'invalid_credentials', '原用户名或原密码错误')
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
      return sendError(reply, 422, 'validation_error', 'Invalid password payload', parsed.error.flatten())
    }

    const result = await changeDefaultPassword(parsed.data.newPassword)
    if (!result) {
      return sendError(reply, 400, 'default_password_change_not_allowed', 'Default password change is not allowed')
    }

    return sendOk(reply, result)
  })
}
