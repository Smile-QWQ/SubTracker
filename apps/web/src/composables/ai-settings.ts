import { computed, reactive, ref, watch } from 'vue'
import { AI_PROVIDER_PRESETS, type AiApiType } from '@subtracker/shared'
import { api } from './api'
import { t } from '@/locales'
import type { AiConfig, AiProviderPreset } from '@/types/api'

type Diagnostic = 'text' | 'vision' | 'structured'
export function useAiSettings(getConfig: () => AiConfig) {
  const models = ref<Array<{ id: string; name: string }>>([])
  const modelsLoading = ref(false)
  const modelMessage = ref('')
  const busy = reactive({ text: false, vision: false, structured: false })
  const results = reactive<Record<Diagnostic, string>>({ text: '', vision: '', structured: '' })
  const success = reactive<Record<Diagnostic, boolean>>({ text: false, vision: false, structured: false })
  let revision = 0
  watch(() => JSON.stringify(getConfig()), () => {
    revision++
    modelsLoading.value = false
    for (const kind of ['text', 'vision', 'structured'] as const) { busy[kind] = false; results[kind] = ''; success[kind] = false }
  }, { flush: 'sync' })
  watch(() => [getConfig().baseUrl, getConfig().apiKey, getConfig().apiType].join('|'), () => {
    models.value = []
    modelMessage.value = ''
  }, { flush: 'sync' })
  const modelOptions = computed(() => models.value.map(({ id }) => ({ label: id, value: id })))
  const clone = () => ({ ...getConfig(), capabilities: { ...getConfig().capabilities } })
  function changePreset(value: AiProviderPreset) {
    const config = getConfig()
    if (value === config.providerPreset) return
    config.apiKey = ''
    config.providerPreset = value
    const preset = AI_PROVIDER_PRESETS.find(item => item.id === value)
    if (!preset) return
    Object.assign(config, { providerName: preset.name, apiType: preset.apiType, baseUrl: preset.baseUrl, model: '',
      capabilities: { vision: preset.vision, structuredOutput: true } })
  }
  function changeBaseUrl(value: string) {
    const config = getConfig()
    // Never carry a credential to a different endpoint path or host.
    if (value.trim().replace(/\/+$/, '') !== config.baseUrl.trim().replace(/\/+$/, '')) config.apiKey = ''
    config.baseUrl = value
  }
  function changeApiType(value: AiApiType) {
    const config = getConfig()
    config.apiType = value
    if (value === 'gemini-content' || value === 'gemini-interactions') {
      try {
        const url = new URL(config.baseUrl)
        if (url.origin === 'https://generativelanguage.googleapis.com' && /^\/v1beta2?\/?$/.test(url.pathname)) {
          config.baseUrl = `${url.origin}/${value === 'gemini-interactions' ? 'v1beta2' : 'v1beta'}`
        }
      } catch { /* Preserve an incomplete custom URL while the user is editing. */ }
    }
  }
  async function fetchModels() {
    if (modelsLoading.value) return
    const current = revision
    modelsLoading.value = true
    modelMessage.value = ''
    try {
      const result = await api.listAiModels(clone())
      if (current !== revision) return
      models.value = result.models
      modelMessage.value = t(result.truncated ? 'settings.aiMaintenance.modelsTruncated' : 'settings.aiMaintenance.modelsLoaded', { count: result.models.length })
    } catch {
      if (current === revision) modelMessage.value = t('settings.aiMaintenance.modelsFailed')
    } finally { if (current === revision) modelsLoading.value = false }
  }
  async function diagnose(kind: Diagnostic) {
    if (busy[kind]) return
    const current = revision
    busy[kind] = true
    results[kind] = ''
    try {
      const run = kind === 'text' ? api.testAiConfigurationWithPayload : kind === 'vision' ? api.testAiVisionConfigurationWithPayload : api.testAiStructuredConfigurationWithPayload
      const result = await run(clone())
      if (current !== revision) return
      success[kind] = result.success
      results[kind] = t(kind === 'structured' && result.format === 'json-object' ? 'settings.aiMaintenance.jsonModePassed' : 'settings.aiMaintenance.passed')
    } catch (error) {
      if (current !== revision) return
      success[kind] = false
      const key = getConfig().apiKey
      const raw = error instanceof Error ? error.message : t('settings.aiMaintenance.failed')
      results[kind] = key ? raw.split(key).join('[redacted]').split(encodeURIComponent(key)).join('[redacted]') : raw
    } finally { if (current === revision) busy[kind] = false }
  }
  return { modelsLoading, modelMessage, modelOptions, busy, results, success, changePreset, changeBaseUrl, changeApiType, fetchModels, diagnose }
}
