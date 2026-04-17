import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createWorker, type Worker } from 'tesseract.js'
import { AiRecognizeSubscriptionSchema, DEFAULT_AI_SUBSCRIPTION_PROMPT } from '@subtracker/shared'
import type { AiRecognitionResultDto } from '@subtracker/shared'
import { getAppSettings } from './settings.service'

export type AiSettings = Awaited<ReturnType<typeof getAppSettings>>['aiConfig']

const ocrCachePath = path.resolve(process.cwd(), 'apps/api/storage/tesseract-cache')
let ocrWorkerPromise: Promise<Worker> | null = null

function ensureAiConfig(aiConfig: AiSettings) {
  if (!aiConfig.enabled) {
    throw new Error('AI 识别未启用')
  }

  if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model) {
    throw new Error('AI 配置不完整')
  }
}

function modelLooksVisionCapable(model: string) {
  const normalized = model.toLowerCase()
  return ['vision', 'vl', 'gpt-4o', 'gpt-4.1', 'gemini', 'claude-3', 'qwen-vl'].some((keyword) =>
    normalized.includes(keyword)
  )
}

function looksLikeImageFormatUnsupported(errorText: string) {
  const normalized = errorText.toLowerCase()
  return (
    normalized.includes('unknown variant `image_url`') ||
    normalized.includes("unknown variant 'image_url'") ||
    normalized.includes('expected `text`') ||
    normalized.includes('expected "text"') ||
    normalized.includes('does not support image') ||
    normalized.includes('image input')
  )
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

async function requestAiChatCompletion(params: {
  aiConfig: AiSettings
  messages: Array<Record<string, unknown>>
  responseFormat?: { type: 'json_object' }
}) {
  const { aiConfig } = params
  ensureAiConfig(aiConfig)

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

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const raw = payload.choices?.[0]?.message?.content
    if (!raw) {
      throw new Error('AI 未返回有效内容')
    }

    return raw
  } finally {
    clearTimeout(timeout)
  }
}

function buildTextOnlyUserContent(input: { text?: string; ocrText?: string }) {
  const parts = [
    input.text?.trim() ? `原始文本：\n${input.text.trim()}` : '',
    input.ocrText?.trim() ? `OCR 提取文本：\n${input.ocrText.trim()}` : ''
  ].filter(Boolean)

  return parts.join('\n\n').trim()
}

async function recognizeByTextOnly(params: {
  aiConfig: AiSettings
  text?: string
  ocrText?: string
}) {
  const userText = buildTextOnlyUserContent({
    text: params.text,
    ocrText: params.ocrText
  })

  if (!userText) {
    throw new Error('未获取到可用于识别的文本内容')
  }

  const raw = await requestAiChatCompletion({
    aiConfig: params.aiConfig,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: params.aiConfig.promptTemplate?.trim() || DEFAULT_AI_SUBSCRIPTION_PROMPT
      },
      {
        role: 'user',
        content: userText
      }
    ]
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

  const raw = await requestAiChatCompletion({
    aiConfig: params.aiConfig,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: params.aiConfig.promptTemplate?.trim() || DEFAULT_AI_SUBSCRIPTION_PROMPT
      },
      {
        role: 'user',
        content
      }
    ]
  })

  return JSON.parse(raw) as AiRecognitionResultDto
}

export async function recognizeSubscriptionByAi(input: unknown): Promise<AiRecognitionResultDto> {
  const parsed = AiRecognizeSubscriptionSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('AI 识别输入不合法')
  }

  const settings = await getAppSettings()
  const { aiConfig } = settings

  const text = parsed.data.text?.trim()
  const imageBase64 = parsed.data.imageBase64

  if (!imageBase64) {
    return recognizeByTextOnly({
      aiConfig,
      text
    })
  }

  if (modelLooksVisionCapable(aiConfig.model)) {
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
    }
  }

  const ocrText = await extractTextFromImageWithOcr(imageBase64)
  if (!ocrText) {
    throw new Error('图片 OCR 未识别出有效文本，请改为手动输入文本内容')
  }

  return recognizeByTextOnly({
    aiConfig,
    text,
    ocrText
  })
}

export async function testAiConnection(overrideConfig?: AiSettings) {
  const settings = await getAppSettings()
  const aiConfig = overrideConfig ?? settings.aiConfig

  const raw = await requestAiChatCompletion({
    aiConfig,
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

