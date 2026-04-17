import { FastifyInstance } from 'fastify'
import { ChangeCredentialsSchema, LoginSchema } from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { changeCredentials, loginWithCredentials } from '../services/auth.service'
import { getAppSettings } from '../services/settings.service'

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/login-options', async (_request, reply) => {
    const settings = await getAppSettings()
    return sendOk(reply, {
      rememberSessionDays: settings.rememberSessionDays
    })
  })

  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid login payload', parsed.error.flatten())
    }

    const result = await loginWithCredentials(parsed.data.username, parsed.data.password, {
      rememberMe: parsed.data.rememberMe,
      rememberDays: parsed.data.rememberDays
    })
    if (!result) {
      return sendError(reply, 401, 'invalid_credentials', '用户名或密码错误')
    }

    return sendOk(reply, result)
  })

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
}
