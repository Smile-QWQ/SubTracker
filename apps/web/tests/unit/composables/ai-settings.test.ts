import { effectScope, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_CONFIG } from '@subtracker/shared'
import { useAiSettings } from '../../../src/composables/ai-settings'
import type { AiConfig } from '../../../src/types/api'

const mocks = vi.hoisted(() => ({ models: vi.fn(), text: vi.fn(), vision: vi.fn(), structured: vi.fn() }))
vi.mock('../../../src/composables/api', () => ({ api: {
  listAiModels: mocks.models, testAiConfigurationWithPayload: mocks.text,
  testAiVisionConfigurationWithPayload: mocks.vision, testAiStructuredConfigurationWithPayload: mocks.structured
} }))
const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const config = reactive<AiConfig>({ ...DEFAULT_AI_CONFIG, enabled: true, apiKey: 'original-key', capabilities: { ...DEFAULT_AI_CONFIG.capabilities } })
  const scope = effectScope(); scopes.push(scope)
  const tools = scope.run(() => useAiSettings(() => config))!
  return { config, tools }
}
beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset() })
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()) })

describe('AI settings draft tools', () => {
  it('clears old credentials when selecting a different provider without hardcoding models', () => {
    const { config, tools } = setup()
    tools.changePreset('anthropic')
    expect(config).toMatchObject({ providerPreset: 'anthropic', apiType: 'anthropic-messages', apiKey: '', model: '' })
    config.apiKey = 'claude-key'
    tools.changePreset('custom')
    expect(config.apiKey).toBe('')
  })
  it('clears keys on address changes but not equivalent trailing slashes', () => {
    const { config, tools } = setup()
    tools.changeBaseUrl(`${config.baseUrl}/`)
    expect(config.apiKey).toBe('original-key')
    tools.changeBaseUrl('https://different.example/v1')
    expect(config.apiKey).toBe('')
  })
  it('switches official Google protocol paths without guessing for custom endpoints', () => {
    const { config, tools } = setup()
    tools.changePreset('gemini')
    config.apiKey = 'google-key'
    tools.changeApiType('gemini-content')
    expect(config.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(config.apiKey).toBe('google-key')
    tools.changeApiType('gemini-interactions')
    expect(config.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta2')
    tools.changeBaseUrl('http://localhost:9988/proxy')
    tools.changeApiType('gemini-content')
    expect(config.baseUrl).toBe('http://localhost:9988/proxy')
  })
  it('uses only model IDs as option labels and values, regardless of provider display names', async () => {
    mocks.models.mockResolvedValue({ models: [
      { id: 'deepseek-flash', name: 'DeepSeek-V4.1 Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4 Pro' }
    ], truncated: false })
    const { config, tools } = setup()
    await tools.fetchModels()
    expect(config.model).toBe('deepseek-chat')
    expect(tools.modelOptions.value).toEqual([
      { label: 'deepseek-flash', value: 'deepseek-flash' },
      { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro' }
    ])
  })
  it('keeps the complete dropdown list when selecting or manually entering a model ID', async () => {
    mocks.models.mockResolvedValue({ models: [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }], truncated: false })
    const { config, tools } = setup()
    await tools.fetchModels()
    const options = [{ label: 'alpha', value: 'alpha' }, { label: 'beta', value: 'beta' }]
    config.model = 'alpha'
    expect(tools.modelOptions.value).toEqual(options)
    config.model = 'arbitrary-manual-model'
    expect(tools.modelOptions.value).toEqual(options)
    expect(config.model).toBe('arbitrary-manual-model')
    expect(config.apiKey).toBe('original-key')
    config.model = ''
    expect(tools.modelOptions.value).toEqual(options)
  })
  it('does not silently hide loaded options after the first hundred models', async () => {
    const models = Array.from({ length: 125 }, (_, i) => ({ id: `model-${i}`, name: `Display ${i}` }))
    mocks.models.mockResolvedValue({ models, truncated: false })
    const { tools } = setup()
    await tools.fetchModels()
    expect(tools.modelOptions.value).toHaveLength(125)
    expect(tools.modelOptions.value[124]).toEqual({ label: 'model-124', value: 'model-124' })
  })
  it('retains the manual model and reports list failure without exposing upstream secrets', async () => {
    mocks.models.mockRejectedValue(new Error('original-key'))
    const { config, tools } = setup()
    await tools.fetchModels()
    expect(config.model).toBe('deepseek-chat')
    expect(tools.modelMessage.value).not.toContain('original-key')
    expect(tools.modelMessage.value).toBeTruthy()
    expect(tools.modelsLoading.value).toBe(false)
  })
  it('does not apply old endpoint model results after a configuration change', async () => {
    let resolve!: (value: unknown) => void
    mocks.models.mockImplementation(() => new Promise(done => { resolve = done }))
    const { tools } = setup()
    const pending = tools.fetchModels()
    tools.changePreset('openai')
    resolve({ models: [{ id: 'old', name: 'old' }], truncated: false })
    await pending
    expect(tools.modelOptions.value).toEqual([])
    expect(tools.modelMessage.value).toBe('')
  })
  it('guards duplicate tests and ignores stale diagnostic responses', async () => {
    let resolve!: (value: unknown) => void
    mocks.text.mockImplementation(() => new Promise(done => { resolve = done }))
    const { config, tools } = setup()
    const pending = tools.diagnose('text')
    await tools.diagnose('text')
    expect(mocks.text).toHaveBeenCalledTimes(1)
    config.model = 'new-model'
    resolve({ success: true })
    await pending
    expect(tools.results.text).toBe('')
  })
  it('runs three independent diagnostics and redacts errors', async () => {
    mocks.text.mockResolvedValue({ success: true })
    mocks.vision.mockRejectedValue(new Error('bad original-key'))
    mocks.structured.mockResolvedValue({ success: true, format: 'json-object' })
    const { config, tools } = setup()
    await tools.diagnose('text'); await tools.diagnose('vision'); await tools.diagnose('structured')
    expect(tools.success).toEqual({ text: true, vision: false, structured: true })
    expect(tools.results.vision).toBe('bad [redacted]')
    expect(tools.results.structured).toContain('JSON')
    expect(mocks.text.mock.calls[0][0]).not.toBe(config)
    expect(mocks.text.mock.calls[0][0].capabilities).not.toBe(config.capabilities)
  })
})
