import { getMessage, type AiApiType, type AppLocale } from '@subtracker/shared'

export interface AiProviderConfig {
  apiType?: AiApiType
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

type JsonObject = Record<string, unknown>
export type AiJsonSchema = JsonObject

export class AiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function items(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : []
}

function textParts(value: unknown, type = 'text') {
  if (typeof value === 'string') return value.trim()
  return items(value).filter(part => part.type === type && part.thought !== true)
    .map(part => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim()
}

function endpoint(config: AiProviderConfig) {
  const url = new URL(config.baseUrl.trim())
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('AI Base URL must use HTTP(S), without credentials, query parameters or fragments.')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
    .replace(/\/(chat\/completions|responses|messages|interactions)$/, '')
    .replace(/\/models\/[^/]+:generateContent$/, '')
  return url.toString().replace(/\/+$/, '')
}

function headers(config: AiProviderConfig): Record<string, string> {
  const type = config.apiType ?? 'openai-chat'
  if (type === 'anthropic-messages') {
    return { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
  }
  if (type.startsWith('gemini-')) return { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }
}

function contentParts(content: AiMessage['content']) {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return content.map(part => {
    if (part.type === 'text' && typeof part.text === 'string') return { type: 'text', text: part.text }
    const imageUrl = object(part.image_url).url
    const match = typeof imageUrl === 'string' ? /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(imageUrl) : null
    if (!match) throw new Error('Unsupported AI image input.')
    return { type: 'image', mimeType: match[1], data: match[2], url: imageUrl }
  })
}

export function buildAiRequest(config: AiProviderConfig, messages: AiMessage[], schema?: AiJsonSchema) {
  const type = config.apiType ?? 'openai-chat'
  const base = endpoint(config)
  const system = messages.filter(message => message.role === 'system').map(message => textParts(message.content)).join('\n\n')
  const turns = messages.filter(message => message.role !== 'system')
  let url: string
  let body: JsonObject

  switch (type) {
    case 'openai-chat':
      url = `${base}/chat/completions`
      body = { model: config.model, messages, ...(schema ? { response_format: { type: 'json_object' } } : {}) }
      break
    case 'openai-responses':
      url = `${base}/responses`
      body = {
        model: config.model, store: false, instructions: system,
        input: turns.map(message => ({ role: message.role, content: contentParts(message.content).map(part => part.type === 'text'
          ? { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: part.text }
          : { type: 'input_image', image_url: part.url }) })),
        ...(schema ? { text: { format: { type: 'json_schema', name: 'subtracker_result', strict: true, schema } } } : {})
      }
      break
    case 'anthropic-messages':
      url = `${base}/messages`
      body = {
        model: config.model, max_tokens: 4096, system,
        messages: turns.map(message => ({ role: message.role, content: contentParts(message.content).map(part => part.type === 'text'
          ? { type: 'text', text: part.text }
          : { type: 'image', source: { type: 'base64', media_type: part.mimeType, data: part.data } }) })),
        ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {})
      }
      break
    case 'gemini-content':
      url = `${base}/models/${encodeURIComponent(config.model.replace(/^models\//, ''))}:generateContent`
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: contentParts(message.content).map(part => part.type === 'text'
          ? { text: part.text } : { inlineData: { mimeType: part.mimeType, data: part.data } }) })),
        ...(schema ? { generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema } } : {})
      }
      break
    case 'gemini-interactions':
      url = `${base}/interactions`
      body = {
        model: config.model.replace(/^models\//, ''), store: false, system_instruction: system,
        input: turns.map(message => ({ type: message.role === 'assistant' ? 'model_output' : 'user_input', content: contentParts(message.content).map(part => part.type === 'text'
          ? { type: 'text', text: part.text } : { type: 'image', mime_type: part.mimeType, data: part.data }) })),
        ...(schema ? { response_format: [{ type: 'text', mime_type: 'application/json', schema }] } : {})
      }
      break
  }
  return { url, headers: headers(config), body }
}

export function extractAiText(value: unknown, type: AiApiType = 'openai-chat', locale: AppLocale = 'zh-CN') {
  const payload = object(value)
  let text = ''
  switch (type) {
    case 'openai-chat': {
      const choice = items(payload.choices)[0] ?? {}
      if (choice.finish_reason === 'length' || choice.finish_reason === 'content_filter') break
      const content = object(choice.message).content
      text = typeof content === 'string' ? content.trim() : textParts(content)
      break
    }
    case 'openai-responses':
      if (payload.status && payload.status !== 'completed') break
      text = items(payload.output).filter(item => item.type === 'message' && item.role === 'assistant')
        .map(item => textParts(item.content, 'output_text')).filter(Boolean).join('\n')
      break
    case 'anthropic-messages':
      if (payload.stop_reason === 'max_tokens' || payload.stop_reason === 'refusal') break
      text = textParts(payload.content)
      break
    case 'gemini-content': {
      const candidate = items(payload.candidates)[0] ?? {}
      if (candidate.finishReason && candidate.finishReason !== 'STOP') break
      text = items(object(candidate.content).parts).filter(part => part.thought !== true)
        .map(part => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim()
      break
    }
    case 'gemini-interactions':
      if (payload.status && payload.status !== 'completed') break
      // Current API returns steps; older compatible endpoints may still return outputs.
      text = Array.isArray(payload.steps)
        ? items(payload.steps).filter(step => step.type === 'model_output' && (!step.status || step.status === 'done'))
          .map(step => textParts(step.content)).filter(Boolean).join('\n')
        : textParts(payload.outputs)
      break
  }
  if (!text.trim()) throw new Error(getMessage(locale, 'api.errors.ai.noValidContent'))
  return text.trim()
}

function redact(text: string, key: string) {
  return key ? text.split(key).join('[redacted]').split(encodeURIComponent(key)).join('[redacted]') : text
}

async function requestJson(config: AiProviderConfig, url: string, init: RequestInit, locale: AppLocale) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(url, { ...init, headers: headers(config), redirect: 'error', signal: controller.signal })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > 4 * 1024 * 1024) {
            await reader.cancel()
            throw new Error(getMessage(locale, 'api.errors.ai.responseTooLarge'))
          }
          chunks.push(chunk.value)
        }
      } finally { reader.releaseLock() }
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (!response.ok) {
      throw new AiRequestError(`${getMessage(locale, 'api.errors.ai.summaryRequestFailed')}: ${response.status} - ${redact(text, config.apiKey).slice(0, 1000)}`, response.status)
    }
    try { return JSON.parse(text) as unknown } catch { throw new Error(getMessage(locale, 'api.errors.ai.invalidResponse')) }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(getMessage(locale, 'api.errors.ai.requestTimeout'))
    if (error instanceof AiRequestError) throw error
    throw new Error(redact(error instanceof Error ? error.message : String(error), config.apiKey))
  } finally { clearTimeout(timeout) }
}

export async function requestAiText(config: AiProviderConfig, messages: AiMessage[], options: { schema?: AiJsonSchema; locale?: AppLocale } = {}) {
  const request = buildAiRequest(config, messages, options.schema)
  const locale = options.locale ?? 'zh-CN'
  const payload = await requestJson(config, request.url, { method: 'POST', body: JSON.stringify(request.body) }, locale)
  return extractAiText(payload, config.apiType, locale)
}

export async function listAiModels(config: AiProviderConfig, locale: AppLocale = 'zh-CN') {
  if (!config.apiKey.trim()) throw new Error(getMessage(locale, 'api.errors.ai.configIncomplete'))
  const type = config.apiType ?? 'openai-chat'
  const google = type.startsWith('gemini-')
  const base = endpoint(config).replace(type === 'gemini-interactions' ? /\/v1beta2$/ : /$^/, '/v1beta')
  const models = new Map<string, { id: string; name: string }>()
  const cursors = new Set<string>()
  let cursor = ''
  let truncated = false
  const deadline = Date.now() + config.timeoutMs
  // Bound pagination and response sizes. Endpoint failure leaves manual model entry available.
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${base}/models`)
    if (google) { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor) }
    if (type === 'anthropic-messages') { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor) }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error(getMessage(locale, 'api.errors.ai.requestTimeout'))
    const payload = object(await requestJson({ ...config, timeoutMs: remaining }, url.toString(), { method: 'GET' }, locale))
    const list = google ? payload.models : payload.data
    if (!Array.isArray(list)) throw new Error(getMessage(locale, 'api.errors.ai.invalidResponse'))
    for (const item of items(list)) {
      const id = google && typeof item.name === 'string' ? item.name.replace(/^models\//, '') : item.id
      if (typeof id !== 'string' || !id.trim() || id.length > 100) continue
      if (google && Array.isArray(item.supportedGenerationMethods) && !item.supportedGenerationMethods.includes('generateContent')) continue
      const name = item.displayName ?? item.display_name ?? item.name
      models.set(id, { id, name: typeof name === 'string' ? name.slice(0, 200) : id })
    }
    const next = google ? payload.nextPageToken : payload.has_more ? payload.last_id : null
    if (typeof next !== 'string' || !next) break
    if (cursors.has(next)) { truncated = true; break }
    cursors.add(next)
    cursor = next
    truncated = page === 4
  }
  return { models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)), truncated }
}
