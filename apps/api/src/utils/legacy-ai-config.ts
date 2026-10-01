import { DEFAULT_AI_CONFIG, type AiConfigInput } from '@subtracker/shared'

// Only the exported copy is downgraded. Older apps cannot safely call native protocols.
export function toLegacyAiConfig(config: AiConfigInput): Omit<AiConfigInput, 'apiType'> {
  const compatible = (config.apiType ?? 'openai-chat') === 'openai-chat'
  const source = compatible ? config : { ...DEFAULT_AI_CONFIG }
  return {
    enabled: compatible && config.enabled,
    dashboardSummaryEnabled: compatible && config.dashboardSummaryEnabled,
    providerPreset: ['custom', 'aliyun-bailian', 'tencent-hunyuan', 'volcengine-ark'].includes(source.providerPreset) ? source.providerPreset : 'custom',
    providerName: source.providerName, baseUrl: source.baseUrl, apiKey: source.apiKey, model: source.model,
    timeoutMs: source.timeoutMs, promptTemplate: config.promptTemplate,
    dashboardSummaryPromptTemplate: config.dashboardSummaryPromptTemplate,
    capabilities: { ...source.capabilities }
  }
}
