import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_API_TYPES, DEFAULT_AI_CONFIG } from '@subtracker/shared'
import { buildAiRequest, extractAiText, listAiModels, requestAiText } from '../../src/services/ai-provider.service'
import { toLegacyAiConfig } from '../../src/utils/legacy-ai-config'

const config = { ...DEFAULT_AI_CONFIG, baseUrl: 'https://example.test/v1/', apiKey: 'private-test-key', model: 'model', timeoutMs: 5000 }
const messages = [
  { role: 'system' as const, content: 'system prompt' },
  { role: 'user' as const, content: [{ type: 'text', text: 'Return JSON' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' } }] }
]
const schema = { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } }, required: ['ok'] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('AI provider protocols', () => {
  it('defaults old configs to Chat Completions without guessing from provider names', () => {
    const request = buildAiRequest({ ...config, apiType: undefined }, messages, schema)
    expect(request.url).toBe('https://example.test/v1/chat/completions')
    expect(request.body).toMatchObject({ messages, response_format: { type: 'json_object' } })
    expect(request.headers.Authorization).toBe('Bearer private-test-key')
    expect(request.body).not.toHaveProperty('temperature')
  })
  it('encodes Responses image input and strict schema without server-side storage', () => {
    const request = buildAiRequest({ ...config, apiType: 'openai-responses' }, messages, schema)
    expect(request.url).toMatch(/responses$/)
    expect(request.body).toMatchObject({ store: false, instructions: 'system prompt', input: [{ role: 'user', content: [{ type: 'input_text' }, { type: 'input_image', image_url: 'data:image/png;base64,YWJj' }] }], text: { format: { type: 'json_schema', strict: true, schema } } })
  })
  it('uses native Claude headers, system field, images and structured output', () => {
    const request = buildAiRequest({ ...config, apiType: 'anthropic-messages' }, messages, schema)
    expect(request.headers).toMatchObject({ 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' })
    expect(request.headers).not.toHaveProperty('Authorization')
    expect(request.body).toMatchObject({ max_tokens: 4096, system: 'system prompt', messages: [{ content: [{ type: 'text' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'YWJj' } }] }], output_config: { format: { type: 'json_schema', schema } } })
  })
  it('encodes both native Gemini APIs independently', () => {
    const content = buildAiRequest({ ...config, apiType: 'gemini-content', model: 'models/flash' }, messages, schema)
    expect(content.url).toBe('https://example.test/v1/models/flash:generateContent')
    expect(content.headers).toMatchObject({ 'x-goog-api-key': config.apiKey })
    expect(content.body).toMatchObject({ contents: [{ role: 'user', parts: [{ text: 'Return JSON' }, { inlineData: { mimeType: 'image/png', data: 'YWJj' } }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema } })
    const interaction = buildAiRequest({ ...config, apiType: 'gemini-interactions' }, messages, schema)
    expect(interaction.body).toMatchObject({ store: false, system_instruction: 'system prompt', input: [{ type: 'user_input', content: [{ type: 'text' }, { type: 'image', mime_type: 'image/png' }] }], response_format: [{ type: 'text', mime_type: 'application/json', schema }] })
  })
  it.each(['https://user:secret@example.test/v1', 'https://example.test/v1?key=test', 'file:///private', 'https://example.test/v1#fragment'])('rejects unsafe base URLs: %s', baseUrl => {
    expect(() => buildAiRequest({ ...config, baseUrl }, messages)).toThrow()
  })
  it('normalizes a pasted full endpoint without duplicating paths', () => {
    expect(buildAiRequest({ ...config, baseUrl: 'https://example.test/v1/chat/completions/' }, messages).url).toBe('https://example.test/v1/chat/completions')
  })
  it.each([
    ['openai-chat', { choices: [{ message: { content: 'ok' } }] }],
    ['openai-responses', { status: 'completed', output: [{ type: 'reasoning', content: [{ type: 'output_text', text: 'secret' }] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] }],
    ['anthropic-messages', { content: [{ type: 'thinking', text: 'secret' }, { type: 'text', text: 'ok' }] }],
    ['gemini-content', { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'secret' }, { text: 'ok' }] } }] }],
    ['gemini-interactions', { status: 'completed', steps: [{ type: 'user_input', content: [{ type: 'text', text: 'question' }] }, { type: 'model_output', status: 'done', content: [{ type: 'text', text: 'ok' }] }] }]
  ] as const)('extracts only final text for %s', (type, payload) => { expect(extractAiText(payload, type)).toBe('ok') })
  it.each([
    ['openai-chat', { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }],
    ['openai-responses', { status: 'incomplete', output: [] }],
    ['anthropic-messages', { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }],
    ['gemini-content', { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'partial' }] } }] }],
    ['gemini-interactions', { status: 'in_progress', outputs: [{ type: 'text', text: 'partial' }] }]
  ] as const)('rejects incomplete or filtered %s output', (type, payload) => { expect(() => extractAiText(payload, type)).toThrow() })
  it('rejects redirects and redacts upstream errors without retrying authentication failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('invalid private-test-key', { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(requestAiText(config, messages)).rejects.toThrow('[redacted]')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })
  it('limits upstream response size and rejects malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(4 * 1024 * 1024 + 1))))
    await expect(requestAiText(config, messages)).rejects.toThrow('大小')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>')))
    await expect(requestAiText(config, messages)).rejects.toThrow('无法识别')
  })
  it('aborts requests at the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort'))))))
    const assertion = expect(requestAiText(config, messages)).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
  })
  it('normalizes and deduplicates models while keeping manual model IDs unrestricted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: [{ id: 'b' }, { id: 'a', name: 'Alpha' }, { id: 'a' }, {}] })))
    const result = await listAiModels(config)
    expect(result.models.map(model => model.id)).toEqual(['a', 'b'])
  })
  it('paginates Claude models and bounds repeated cursors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ data: [{ id: 'a', display_name: 'A' }], has_more: true, last_id: 'a' })).mockResolvedValue(json({ data: [{ id: 'b' }], has_more: true, last_id: 'a' }))
    vi.stubGlobal('fetch', fetcher)
    const result = await listAiModels({ ...config, apiType: 'anthropic-messages' })
    expect(result.models).toHaveLength(2)
    expect(result.truncated).toBe(true)
    expect(fetcher.mock.calls[1][0]).toContain('after_id=a')
  })
  it('lists Gemini generation models on its models API instead of the Interactions API version', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ models: [{ name: 'models/good', displayName: 'Good', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }] }))
    vi.stubGlobal('fetch', fetcher)
    const result = await listAiModels({ ...config, apiType: 'gemini-interactions', baseUrl: 'https://example.test/v1beta2' })
    expect(fetcher.mock.calls[0][0]).toContain('/v1beta/models?')
    expect(result.models).toEqual([{ id: 'good', name: 'Good' }])
  })
})

describe('legacy AI export projection', () => {
  it('maps new Chat Completions presets to custom and preserves working settings', () => {
    const source = { ...config, enabled: true, providerPreset: 'deepseek' as const }
    const legacy = toLegacyAiConfig(source)
    expect(legacy).toMatchObject({ enabled: true, providerPreset: 'custom', apiKey: config.apiKey, baseUrl: config.baseUrl })
    expect(legacy).not.toHaveProperty('apiType')
    expect(source.providerPreset).toBe('deepseek')
  })
  it.each(AI_API_TYPES.filter(type => type !== 'openai-chat'))('disables unsupported %s only in the exported copy', apiType => {
    const source = { ...config, apiType, enabled: true, dashboardSummaryEnabled: true, providerPreset: 'anthropic' as const }
    const legacy = toLegacyAiConfig(source)
    expect(legacy).toMatchObject({ enabled: false, dashboardSummaryEnabled: false, apiKey: '', baseUrl: DEFAULT_AI_CONFIG.baseUrl, providerPreset: 'custom' })
    expect(legacy).not.toHaveProperty('apiType')
    expect(source.apiKey).toBe(config.apiKey)
    expect(source.enabled).toBe(true)
  })
})
