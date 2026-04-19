import { FastifyInstance } from 'fastify'
import { sendError, sendOk } from '../http'
import { getAppSettings, setSetting } from '../services/settings.service'
import { SettingsSchema } from '@subtracker/shared'

function validateSettingsPayload(settings: Awaited<ReturnType<typeof getAppSettings>>) {
  const missingEmailFields = [
    ['SMTP Host', settings.emailConfig.host],
    ['端口', settings.emailConfig.port],
    ['用户名', settings.emailConfig.username],
    ['密码', settings.emailConfig.password],
    ['发件人', settings.emailConfig.from],
    ['收件人', settings.emailConfig.to]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.emailNotificationsEnabled && missingEmailFields.length) {
    throw new Error(`启用邮箱通知时必须填写：${missingEmailFields.join('、')}`)
  }

  if (settings.pushplusNotificationsEnabled && !settings.pushplusConfig.token.trim()) {
    throw new Error('启用 PushPlus 时必须填写 Token')
  }

  const missingAiFields = [
    ['Provider 名称', settings.aiConfig.providerName],
    ['Model', settings.aiConfig.model],
    ['API Base URL', settings.aiConfig.baseUrl],
    ['API Key', settings.aiConfig.apiKey]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.aiConfig.enabled && missingAiFields.length) {
    throw new Error(`启用 AI 识别时必须填写：${missingAiFields.join('、')}`)
  }
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', async (_, reply) => {
    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })

  app.patch('/settings', async (request, reply) => {
    const parsed = SettingsSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid settings payload', parsed.error.flatten())
    }

    const currentSettings = await getAppSettings()
    const nextSettings = {
      ...currentSettings,
      ...parsed.data,
      emailConfig: parsed.data.emailConfig ? { ...currentSettings.emailConfig, ...parsed.data.emailConfig } : currentSettings.emailConfig,
      pushplusConfig: parsed.data.pushplusConfig ? { ...currentSettings.pushplusConfig, ...parsed.data.pushplusConfig } : currentSettings.pushplusConfig,
      aiConfig: parsed.data.aiConfig
        ? {
            ...currentSettings.aiConfig,
            ...parsed.data.aiConfig,
            capabilities: {
              ...currentSettings.aiConfig.capabilities,
              ...parsed.data.aiConfig.capabilities
            }
          }
        : currentSettings.aiConfig
    }

    try {
      validateSettingsPayload(nextSettings)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'Invalid settings payload')
    }

    await Promise.all(
      Object.entries(parsed.data).map(([key, value]) => {
        return value === undefined ? Promise.resolve() : setSetting(key, value)
      })
    )

    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })
}
