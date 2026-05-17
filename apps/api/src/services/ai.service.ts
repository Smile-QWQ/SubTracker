import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createWorker, type Worker } from 'tesseract.js'
import { AiRecognizeSubscriptionSchema, getDefaultAiSubscriptionPrompt, getMessage, type AppLocale } from '@subtracker/shared'
import type { AiRecognitionResultDto } from '@subtracker/shared'
import { getAiConfig, getResolvedAppLocale } from './settings.service'

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

const ocrCachePath = path.resolve(process.cwd(), 'apps/api/storage/tesseract-cache')
const visionTestImageBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKUlEQVR4nO3OIQEAAAACIP+f1hkWWEB6FgEBAQEBAQEBAQEBAQEBgXdgl/rw4unIZ5cAAAAASUVORK5CYII='
let ocrWorkerPromise: Promise<Worker> | null = null

function getAiFeatureLabel(locale: AppLocale, featureKey: 'general' | 'summary') {
  return featureKey === 'summary' ? getMessage(locale, 'settings.labels.aiSummary') : getMessage(locale, 'settings.sections.ai')
}

function getJsonOnlySuffix(locale: AppLocale) {
  return getMessage(locale, 'ai.prompts.common.jsonOnlySuffix')
}

export function ensureAiConfig(
  aiConfig: AiSettings,
  options?: { requireEnabled?: boolean; featureKey?: 'general' | 'summary'; locale?: AppLocale }
) {
  const locale = options?.locale ?? 'zh-CN'
  const featureLabel = getAiFeatureLabel(locale, options?.featureKey ?? 'general')

  if (options?.requireEnabled !== false && !aiConfig.enabled) {
    throw new Error(getMessage(locale, 'api.errors.ai.disabled').replace(/^AI/, featureLabel))
  }

  if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model) {
    throw new Error(getMessage(locale, 'api.errors.ai.configIncomplete').replace(/^AI/, featureLabel))
  }
}

export function ensureAiSummaryConfig(aiConfig: AiSettings, locale: AppLocale = 'zh-CN') {
  if (!aiConfig.dashboardSummaryEnabled) {
    throw new Error(getMessage(locale, 'api.errors.ai.summaryDisabled'))
  }

  ensureAiConfig(aiConfig, { requireEnabled: false, featureKey: 'summary', locale })
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

export function extractChatCompletionText(payload: ChatCompletionPayload, locale: AppLocale = 'zh-CN') {
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

  throw new Error(getMessage(locale, 'api.errors.ai.noValidContent'))
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      await mkdir(ocrCachePath, { recursive: true })
      return createWorker(['eng', 'chi_sim'], 1, {
        cachePath: ocrCachePath,
        logger: () => {}
      })
    })()
  }

  return ocrWorkerPromise
}

async function extractTextFromImageWithOcr(imageBase64: string) {
  const worker = await getOcrWorker()
  const imageBuffer = Buffer.from(imageBase64, 'base64')
  const result = await worker.recognize(imageBuffer)
  return (result.data.text || '').trim()
}

async function buildRecognitionSystemPrompt(aiConfig: AiSettings, forceJsonPromptOnly = false, locale?: AppLocale) {
  const resolvedLocale = locale ?? (await getResolvedAppLocale())
  const basePrompt = aiConfig.promptTemplate?.trim() || getDefaultAiSubscriptionPrompt(resolvedLocale)
  if (!forceJsonPromptOnly) {
    return basePrompt
  }

  return `${basePrompt}\n\n${getJsonOnlySuffix(resolvedLocale)}`
}

async function requestAiChatCompletion(params: {
  aiConfig: AiSettings
  messages: ChatMessage[]
  responseFormat?: { type: 'json_object' }
  requireEnabled?: boolean
  locale?: AppLocale
}) {
  const { aiConfig } = params
  const locale = params.locale ?? 'zh-CN'
  ensureAiConfig(aiConfig, { requireEnabled: params.requireEnabled, locale })

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
      throw new Error(`${getMessage(locale, 'api.errors.ai.summaryRequestFailed')}: ${response.status}${errorText ? ` - ${errorText}` : ''}`)
    }

    const payload = (await response.json()) as ChatCompletionPayload
    return extractChatCompletionText(payload, locale)
  } finally {
    clearTimeout(timeout)
  }
}

async function requestStructuredJsonCompletion(params: {
  aiConfig: AiSettings
  userContent: string | Array<Record<string, unknown>>
  locale: AppLocale
}) {
  const attempt = async (promptOnlyJson: boolean) => {
    return requestAiChatCompletion({
      aiConfig: params.aiConfig,
      locale: params.locale,
      responseFormat: promptOnlyJson ? undefined : { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: await buildRecognitionSystemPrompt(params.aiConfig, promptOnlyJson, params.locale)
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

function buildTextOnlyUserContent(input: { text?: string; ocrText?: string }, locale: AppLocale) {
  const parts = [
    input.text?.trim() ? `${getMessage(locale, 'ai.prompts.common.originalTextLabel')}:\n${input.text.trim()}` : '',
    input.ocrText?.trim() ? `${getMessage(locale, 'ai.prompts.common.ocrExtractedTextLabel')}:\n${input.ocrText.trim()}` : ''
  ].filter(Boolean)

  return parts.join('\n\n').trim()
}

async function recognizeByTextOnly(params: {
  aiConfig: AiSettings
  text?: string
  ocrText?: string
  locale: AppLocale
}) {
  const userText = buildTextOnlyUserContent({
    text: params.text,
    ocrText: params.ocrText
  }, params.locale)

  if (!userText) {
    throw new Error(getMessage(params.locale, 'api.errors.ai.noRecognizableText'))
  }

  const raw = await requestStructuredJsonCompletion({
    aiConfig: params.aiConfig,
    userContent: userText,
    locale: params.locale
  })

  return JSON.parse(raw) as AiRecognitionResultDto
}

async function recognizeByVision(params: {
  aiConfig: AiSettings
  text?: string
  imageBase64: string
  mimeType?: string
  locale: AppLocale
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
    userContent: content,
    locale: params.locale
  })

  return JSON.parse(raw) as AiRecognitionResultDto
}

export async function recognizeSubscriptionByAi(input: unknown, locale?: AppLocale): Promise<AiRecognitionResultDto> {
  const parsed = AiRecognizeSubscriptionSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(getMessage(locale ?? 'zh-CN', 'api.errors.ai.invalidRecognitionInput'))
  }

  const aiConfig = await getAiConfig()
  const resolvedLocale = locale ?? (await getResolvedAppLocale())

  const text = parsed.data.text?.trim()
  const imageBase64 = parsed.data.imageBase64

  if (!imageBase64) {
    return recognizeByTextOnly({
      aiConfig,
      text,
      locale: resolvedLocale
    })
  }

  if (aiConfig.capabilities.vision) {
    try {
      return await recognizeByVision({
        aiConfig,
        text,
        imageBase64,
        mimeType: parsed.data.mimeType,
        locale: resolvedLocale
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!looksLikeImageFormatUnsupported(message)) {
        throw error
      }
    }
  }

  const ocrText = await extractTextFromImageWithOcr(imageBase64)
  if (!ocrText) {
    throw new Error(getMessage(resolvedLocale, 'api.errors.ai.ocrNoValidText'))
  }

  return recognizeByTextOnly({
    aiConfig,
    text,
    ocrText,
    locale: resolvedLocale
  })
}

export async function testAiConnection(overrideConfig?: AiSettings, locale?: AppLocale) {
  const aiConfig = overrideConfig ?? (await getAiConfig())
  const resolvedLocale = locale ?? (await getResolvedAppLocale())

  const raw = await requestAiChatCompletion({
    aiConfig,
    locale: resolvedLocale,
    requireEnabled: false,
    messages: [
      {
        role: 'system',
        content: getMessage(resolvedLocale, 'ai.prompts.common.returnOkOnly')
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

export async function testAiVisionConnection(overrideConfig?: AiSettings, locale?: AppLocale) {
  const aiConfig = overrideConfig ?? (await getAiConfig())
  const resolvedLocale = locale ?? (await getResolvedAppLocale())
  if (!aiConfig.capabilities.vision) {
    throw new Error(getMessage(resolvedLocale, 'api.errors.ai.visionCapabilityDisabled'))
  }

  const raw = await requestAiChatCompletion({
    aiConfig,
    locale: resolvedLocale,
    requireEnabled: false,
    messages: [
      {
        role: 'system',
        content: getMessage(resolvedLocale, 'ai.prompts.common.visionConfirmSystem')
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: getMessage(resolvedLocale, 'ai.prompts.common.visionConfirmUser')
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
