import { AiRecognizeSubscriptionSchema, DEFAULT_AI_SUBSCRIPTION_PROMPT, getMessage } from '@subtracker/shared'
import { DEFAULT_APP_LOCALE, type AppLocale } from '@subtracker/shared/locale-core'
import type { AiRecognitionResultDto } from '@subtracker/shared'
import { getAiConfig } from './settings.service'

export type AiSettings = Awaited<ReturnType<typeof getAiConfig>>

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<Record<string, unknown>>
    }
  }>
}

const visionTestImageBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKUlEQVR4nO3OIQEAAAACIP+f1hkWWEB6FgEBAQEBAQEBAQEBAQEBgXdgl/rw4unIZ5cAAAAASUVORK5CYII='
const jsonOnlySuffix = getMessage(DEFAULT_APP_LOCALE, 'ai.prompts.common.jsonOnlySuffix')

function resolveAiLocale(locale?: AppLocale) {
  return locale ?? DEFAULT_APP_LOCALE
}

export function ensureAiConfig(
  aiConfig: AiSettings,
  options?: { requireEnabled?: boolean; featureLabel?: string; locale?: AppLocale }
) {
  const locale = resolveAiLocale(options?.locale)
  if (options?.requireEnabled !== false && !aiConfig.enabled) {
    throw new Error(
      options?.featureLabel === getMessage(locale, 'statistics.ai.title')
        ? getMessage(locale, 'api.errors.ai.summaryDisabled')
        : getMessage(locale, 'api.errors.ai.disabled')
    )
  }

  if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model) {
    throw new Error(
      options?.featureLabel === getMessage(locale, 'statistics.ai.title')
        ? getMessage(locale, 'api.errors.ai.summaryConfigIncomplete')
        : getMessage(locale, 'api.errors.ai.configIncomplete')
    )
  }
}

export function ensureAiSummaryConfig(aiConfig: AiSettings, locale?: AppLocale) {
  const resolvedLocale = resolveAiLocale(locale)
  if (!aiConfig.dashboardSummaryEnabled) {
    throw new Error(getMessage(resolvedLocale, 'api.errors.ai.summaryDisabled'))
  }

  ensureAiConfig(aiConfig, {
    requireEnabled: false,
    featureLabel: getMessage(resolvedLocale, 'statistics.ai.title'),
    locale: resolvedLocale
  })
}

export function looksLikeImageFormatUnsupported(errorText: string) {
  const normalized = errorText.toLowerCase()
  return (
    normalized.includes('unknown variant `image_url`') ||
    normalized.includes("unknown variant 'image_url'") ||
    normalized.includes('expected `text`') ||
    normalized.includes('expected "text"') ||
    normalized.includes('does not support image') ||
    normalized.includes('image input') ||
    normalized.includes('image_url')
  )
}

export function looksLikeStructuredOutputUnsupported(errorText: string) {
  const normalized = errorText.toLowerCase()
  return (
    normalized.includes('response_format') ||
    normalized.includes('json_object') ||
    normalized.includes('json schema') ||
    normalized.includes('structured output') ||
    normalized.includes('json mode')
  )
}

export function extractChatCompletionText(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()

    if (text) {
      return text
    }
  }

  throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.noValidContent'))
}

function buildRecognitionSystemPrompt(aiConfig: AiSettings, forceJsonPromptOnly = false) {
  const basePrompt = aiConfig.promptTemplate?.trim() || DEFAULT_AI_SUBSCRIPTION_PROMPT
  if (!forceJsonPromptOnly) {
    return basePrompt
  }

  return `${basePrompt}\n\n${jsonOnlySuffix}`
}

async function requestAiChatCompletion(params: {
  aiConfig: AiSettings
  messages: ChatMessage[]
  responseFormat?: { type: 'json_object' }
  requireEnabled?: boolean
}) {
  const { aiConfig } = params
  ensureAiConfig(aiConfig, { requireEnabled: params.requireEnabled })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), aiConfig.timeoutMs)

  try {
    const response = await fetch(`${aiConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: 0.1,
        ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
        messages: params.messages
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.requestFailed')}：${response.status}${errorText ? ` - ${errorText}` : ''}`)
    }

    const payload = (await response.json()) as ChatCompletionPayload
    return extractChatCompletionText(payload)
  } finally {
    clearTimeout(timeout)
  }
}

async function requestStructuredJsonCompletion(params: {
  aiConfig: AiSettings
  userContent: string | Array<Record<string, unknown>>
}) {
  const attempt = async (promptOnlyJson: boolean) => {
    return requestAiChatCompletion({
      aiConfig: params.aiConfig,
      responseFormat: promptOnlyJson ? undefined : { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildRecognitionSystemPrompt(params.aiConfig, promptOnlyJson)
        },
        {
          role: 'user',
          content: params.userContent
        }
      ]
    })
  }

  if (!params.aiConfig.capabilities.structuredOutput) {
    return attempt(true)
  }

  try {
    return await attempt(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!looksLikeStructuredOutputUnsupported(message)) {
      throw error
    }
    return attempt(true)
  }
}

async function recognizeByTextOnly(params: {
  aiConfig: AiSettings
  text: string
}) {
  const raw = await requestStructuredJsonCompletion({
    aiConfig: params.aiConfig,
    userContent: params.text.trim()
  })

  return JSON.parse(raw) as AiRecognitionResultDto
}

async function recognizeByVision(params: {
  aiConfig: AiSettings
  text?: string
  imageBase64: string
  mimeType?: string
}) {
  const content: Array<Record<string, unknown>> = []

  if (params.text?.trim()) {
    content.push({
      type: 'text',
      text: params.text.trim()
    })
  }

  content.push({
    type: 'image_url',
    image_url: {
      url: `data:${params.mimeType || 'image/png'};base64,${params.imageBase64}`
    }
  })

  const raw = await requestStructuredJsonCompletion({
    aiConfig: params.aiConfig,
    userContent: content
  })

  return JSON.parse(raw) as AiRecognitionResultDto
}

export async function recognizeSubscriptionByAi(input: unknown): Promise<AiRecognitionResultDto> {
  const parsed = AiRecognizeSubscriptionSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.invalidRecognitionInput'))
  }

  const aiConfig = await getAiConfig()
  const text = parsed.data.text?.trim()
  const imageBase64 = parsed.data.imageBase64?.trim()

  if (!text && !imageBase64) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.textOrImageRequired'))
  }

  if (imageBase64) {
    if (!aiConfig.capabilities.vision) {
      if (text) {
        return recognizeByTextOnly({
          aiConfig,
          text
        })
      }

      throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.visionNoOcr'))
    }

    try {
      return await recognizeByVision({
        aiConfig,
        text,
        imageBase64,
        mimeType: parsed.data.mimeType
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!looksLikeImageFormatUnsupported(message)) {
        throw error
      }

      if (text) {
        return recognizeByTextOnly({
          aiConfig,
          text
        })
      }

      throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.visionUnsupportedNoOcrFallback'))
    }
  }

  return recognizeByTextOnly({
    aiConfig,
    text: text ?? ''
  })
}

export async function testAiConnection(overrideConfig?: AiSettings) {
  const aiConfig = overrideConfig ?? (await getAiConfig())
  const raw = await requestAiChatCompletion({
    aiConfig,
    requireEnabled: false,
    messages: [
      {
        role: 'system',
        content: getMessage(DEFAULT_APP_LOCALE, 'ai.prompts.common.returnOkOnly')
      },
      {
        role: 'user',
        content: 'ping'
      }
    ]
  })

  return {
    success: true,
    providerName: aiConfig.providerName,
    model: aiConfig.model,
    response: raw.trim()
  }
}

export async function testAiVisionConnection(overrideConfig?: AiSettings) {
  const aiConfig = overrideConfig ?? (await getAiConfig())
  if (!aiConfig.capabilities.vision) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.ai.visionCapabilityDisabled'))
  }

  const raw = await requestAiChatCompletion({
    aiConfig,
    requireEnabled: false,
    messages: [
      {
        role: 'system',
        content: getMessage(DEFAULT_APP_LOCALE, 'ai.prompts.common.visionConfirmSystem')
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: getMessage(DEFAULT_APP_LOCALE, 'ai.prompts.common.visionConfirmUser')
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${visionTestImageBase64}`
            }
          }
        ]
      }
    ]
  })

  return {
    success: true,
    providerName: aiConfig.providerName,
    model: aiConfig.model,
    response: raw.trim()
  }
}
