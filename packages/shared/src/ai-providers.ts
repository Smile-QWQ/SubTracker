export const AI_API_TYPES = ['openai-chat', 'openai-responses', 'anthropic-messages', 'gemini-content', 'gemini-interactions'] as const
export type AiApiType = typeof AI_API_TYPES[number]

export const AI_PROVIDER_IDS = [
  'custom', 'openai', 'anthropic', 'gemini', 'deepseek', 'moonshot', 'zhipu', 'siliconflow', 'openrouter',
  'aliyun-bailian', 'tencent-hunyuan', 'volcengine-ark'
] as const

export interface AiProviderDefinition {
  id: Exclude<typeof AI_PROVIDER_IDS[number], 'custom'>
  name: string
  apiType: AiApiType
  baseUrl: string
  vision: boolean
}

// Presets describe the endpoint, not a model's capabilities. Models remain user-selectable.
export const AI_PROVIDER_PRESETS: readonly AiProviderDefinition[] = [
  { id: 'openai', name: 'OpenAI', apiType: 'openai-responses', baseUrl: 'https://api.openai.com/v1', vision: true },
  { id: 'anthropic', name: 'Anthropic', apiType: 'anthropic-messages', baseUrl: 'https://api.anthropic.com/v1', vision: true },
  { id: 'gemini', name: 'Google Gemini', apiType: 'gemini-interactions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta2', vision: true },
  { id: 'deepseek', name: 'DeepSeek', apiType: 'openai-chat', baseUrl: 'https://api.deepseek.com', vision: false },
  { id: 'moonshot', name: 'Kimi / Moonshot', apiType: 'openai-chat', baseUrl: 'https://api.moonshot.cn/v1', vision: false },
  { id: 'zhipu', name: 'Z.ai / GLM', apiType: 'openai-chat', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', vision: false },
  { id: 'siliconflow', name: 'SiliconFlow', apiType: 'openai-chat', baseUrl: 'https://api.siliconflow.cn/v1', vision: false },
  { id: 'openrouter', name: 'OpenRouter', apiType: 'openai-chat', baseUrl: 'https://openrouter.ai/api/v1', vision: false },
  { id: 'aliyun-bailian', name: 'Alibaba Cloud Bailian', apiType: 'openai-chat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', vision: true },
  { id: 'tencent-hunyuan', name: 'Tencent Hunyuan', apiType: 'openai-chat', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', vision: true },
  { id: 'volcengine-ark', name: 'Volcengine Ark', apiType: 'openai-chat', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', vision: true }
]
