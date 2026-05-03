import { AiRecognizeSubscriptionSchema, DEFAULT_AI_SUBSCRIPTION_PROMPT } from '@subtracker/shared'
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
const jsonOnlySuffix = '必须只返回合法 JSON 对象，不要返回 Markdown、代码块或额外解释。'

export function ensureAiConfig(aiConfig: AiSettings, options?: { requireEnabled?: boolean; featureLabel?: string }) {
  if (options?.requireEnabled !== false && !aiConfig.enabled) {
    throw new Error(`${options?.featureLabel ?? 'AI 功能'}未启用`)
  }

  if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model) {
    throw new Error(`${options?.featureLabel ?? 'AI'}配置不完整`)
  }
}

export function ensureAiSummaryConfig(aiConfig: AiSettings) {
  if (!aiConfig.dashboardSummaryEnabled) {
    throw new Error('AI 总结未启用')
  }

  ensureAiConfig(aiConfig, { requireEnabled: false, featureLabel: 'AI 总结' })
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

  throw new Error('AI 未返回有效内容')
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
      throw new Error(`AI 接口请求失败：${response.status}${errorText ? ` - ${errorText}` : ''}`)
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
    throw new Error('AI 识别输入不合法')
  }

  const aiConfig = await getAiConfig()
  const text = parsed.data.text?.trim()
  const imageBase64 = parsed.data.imageBase64?.trim()

  if (!text && !imageBase64) {
    throw new Error('请至少提供文本或图片')
  }

  if (imageBase64) {
    if (!aiConfig.capabilities.vision) {
      if (text) {
        return recognizeByTextOnly({
          aiConfig,
          text
        })
      }

      throw new Error('当前模型未开启视觉输入，Cloudflare Worker 版本已移除本地 OCR')
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

      throw new Error('当前模型不支持视觉输入，且 Cloudflare Worker 版本不提供本地 OCR 回退')
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
        content: '请只返回 OK'
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
    throw new Error('当前 Provider 未启用视觉输入能力')
  }

  const raw = await requestAiChatCompletion({
    aiConfig,
    requireEnabled: false,
    messages: [
      {
        role: 'system',
        content: '请根据用户发送的图片进行响应，只返回一句简短确认。'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请确认你已成功接收到这张测试图片。'
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
