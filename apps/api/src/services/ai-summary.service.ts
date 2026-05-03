import crypto from 'node:crypto'
import {
  DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT,
  DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT,
  formatAiSummaryPreviewText,
  type AiDashboardSummaryDto,
  type DashboardOverview
} from '@subtracker/shared'
import { ensureAiSummaryConfig } from './ai.service'
import { createComputedCache, deleteComputedCache, getComputedCache, setComputedCache } from './computed-cache-store.service'
import { getOverviewStatistics } from './statistics.service'
import { getAiConfig } from './settings.service'

type CachedDashboardSummary = {
  scope: 'dashboard-overview'
  status: AiDashboardSummaryDto['status']
  content: string | null
  previewContent: string | null
  errorMessage: string | null
  generatedAt: string | null
  updatedAt: string | null
  sourceDataHash: string | null
}

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<Record<string, unknown>>
    }
  }>
}

const DASHBOARD_SUMMARY_SCOPE = 'dashboard-overview' as const
const DASHBOARD_SUMMARY_CACHE_NAMESPACE = 'ai-summary'
const DASHBOARD_SUMMARY_CACHE_KEY = 'dashboard-overview'
const DASHBOARD_SUMMARY_STORAGE_TTL_SECONDS = 30 * 24 * 60 * 60
const DASHBOARD_SUMMARY_LOCK_KEY = 'dashboard-overview:lock'
const DASHBOARD_SUMMARY_LOCK_TTL_SECONDS = 2 * 60
const DASHBOARD_SUMMARY_STATUSES = new Set<AiDashboardSummaryDto['status']>([
  'idle',
  'unconfigured',
  'generating',
  'success',
  'failed'
])

const EMPTY_DASHBOARD_SUMMARY_CACHE: CachedDashboardSummary = {
  scope: DASHBOARD_SUMMARY_SCOPE,
  status: 'idle',
  content: null,
  previewContent: null,
  errorMessage: null,
  generatedAt: null,
  updatedAt: null,
  sourceDataHash: null
}

let dashboardSummaryCache: CachedDashboardSummary | null = null
let inflightGeneratePromise: Promise<AiDashboardSummaryDto> | null = null

type DashboardSummaryGenerationLock = {
  scope: 'dashboard-overview'
  ownerId: string
  createdAt: string
  expiresAt: string
}

function createEmptyDashboardSummaryCache(): CachedDashboardSummary {
  return {
    ...EMPTY_DASHBOARD_SUMMARY_CACHE
  }
}

function cloneDashboardSummaryCache(state: CachedDashboardSummary) {
  return {
    ...state
  }
}

function toNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function normalizeStoredDashboardSummary(value: unknown): CachedDashboardSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<CachedDashboardSummary>
  if (candidate.scope !== DASHBOARD_SUMMARY_SCOPE) {
    return null
  }

  if (!DASHBOARD_SUMMARY_STATUSES.has(candidate.status as AiDashboardSummaryDto['status'])) {
    return null
  }

  return {
    scope: DASHBOARD_SUMMARY_SCOPE,
    status: candidate.status as AiDashboardSummaryDto['status'],
    content: toNullableString(candidate.content),
    previewContent: toNullableString(candidate.previewContent),
    errorMessage: toNullableString(candidate.errorMessage),
    generatedAt: toNullableString(candidate.generatedAt),
    updatedAt: toNullableString(candidate.updatedAt),
    sourceDataHash: toNullableString(candidate.sourceDataHash)
  }
}

async function loadPersistedDashboardSummary() {
  const persisted = await getComputedCache<unknown>(DASHBOARD_SUMMARY_CACHE_NAMESPACE, DASHBOARD_SUMMARY_CACHE_KEY)
  return normalizeStoredDashboardSummary(persisted) ?? createEmptyDashboardSummaryCache()
}

async function getDashboardSummaryCacheState(forceRefresh = false) {
  if (!forceRefresh && dashboardSummaryCache) {
    return cloneDashboardSummaryCache(dashboardSummaryCache)
  }

  const loaded = await loadPersistedDashboardSummary()
  dashboardSummaryCache = loaded
  return cloneDashboardSummaryCache(loaded)
}

function updateMemoryDashboardSummaryCache(next: CachedDashboardSummary) {
  dashboardSummaryCache = cloneDashboardSummaryCache(next)
}

async function persistDashboardSummaryCache(next: CachedDashboardSummary) {
  updateMemoryDashboardSummaryCache(next)
  await setComputedCache(
    DASHBOARD_SUMMARY_CACHE_NAMESPACE,
    DASHBOARD_SUMMARY_CACHE_KEY,
    next,
    DASHBOARD_SUMMARY_STORAGE_TTL_SECONDS
  )
}

function createDashboardSummaryLock(ownerId: string): DashboardSummaryGenerationLock {
  const createdAt = new Date().toISOString()
  return {
    scope: DASHBOARD_SUMMARY_SCOPE,
    ownerId,
    createdAt,
    expiresAt: new Date(Date.now() + DASHBOARD_SUMMARY_LOCK_TTL_SECONDS * 1000).toISOString()
  }
}

async function claimDashboardSummaryGenerationLock() {
  const ownerId = crypto.randomUUID()
  const existingLock = await getComputedCache<unknown>(DASHBOARD_SUMMARY_CACHE_NAMESPACE, DASHBOARD_SUMMARY_LOCK_KEY)
  if (existingLock) {
    return {
      claimed: false,
      ownerId
    }
  }
  const claimed = await createComputedCache(
    DASHBOARD_SUMMARY_CACHE_NAMESPACE,
    DASHBOARD_SUMMARY_LOCK_KEY,
    createDashboardSummaryLock(ownerId),
    DASHBOARD_SUMMARY_LOCK_TTL_SECONDS
  )

  return {
    claimed,
    ownerId
  }
}

async function releaseDashboardSummaryGenerationLock(ownerId: string) {
  const existing = await getComputedCache<unknown>(DASHBOARD_SUMMARY_CACHE_NAMESPACE, DASHBOARD_SUMMARY_LOCK_KEY)
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return
  }

  if ((existing as Partial<DashboardSummaryGenerationLock>).ownerId !== ownerId) {
    return
  }

  await deleteComputedCache(DASHBOARD_SUMMARY_CACHE_NAMESPACE, DASHBOARD_SUMMARY_LOCK_KEY)
}

function inferUnconfiguredMessage(aiConfig: Awaited<ReturnType<typeof getAiConfig>>) {
  if (!aiConfig.dashboardSummaryEnabled) return 'AI 总结未启用'
  if (!aiConfig.enabled) return 'AI 能力未启用'
  return 'AI 总结配置不完整'
}

function resolveDashboardSummaryPrompt(promptTemplate?: string | null) {
  const normalized = String(promptTemplate ?? '').trim()
  return normalized || DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT
}

function resolveDashboardSummaryPreviewPrompt() {
  return DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT
}

function extractChatCompletionText(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

function buildSummaryInput(overview: DashboardOverview) {
  return {
    summary: {
      activeSubscriptions: overview.activeSubscriptions,
      upcoming7Days: overview.upcoming7Days,
      upcoming30Days: overview.upcoming30Days,
      monthlyEstimatedBase: overview.monthlyEstimatedBase,
      yearlyEstimatedBase: overview.yearlyEstimatedBase,
      monthlyBudgetBase: overview.monthlyBudgetBase ?? null,
      yearlyBudgetBase: overview.yearlyBudgetBase ?? null,
      monthlyBudgetUsageRatio: overview.monthlyBudgetUsageRatio ?? null,
      yearlyBudgetUsageRatio: overview.yearlyBudgetUsageRatio ?? null
    },
    budgetSummary: overview.budgetSummary,
    tagSpendTop: [...overview.tagSpend]
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 8),
    statusDistribution: overview.statusDistribution,
    renewalModeDistribution: overview.renewalModeDistribution,
    currencyDistribution: overview.currencyDistribution,
    upcomingRenewalsTop: overview.upcomingRenewals.slice(0, 8),
    topSubscriptionsByMonthlyCost: overview.topSubscriptionsByMonthlyCost.slice(0, 8),
    upcomingByDayNonZero: overview.upcomingByDay.filter((item) => item.count > 0 || item.amount > 0).slice(0, 15),
    tagBudgetSummary: overview.tagBudgetSummary ?? null,
    tagBudgetUsageTop:
      (overview.tagBudgetUsage ?? [])
        .filter((item) => item.ratio > 0)
        .sort((a, b) => b.ratio - a.ratio || b.spent - a.spent)
        .slice(0, 8) ?? []
  }
}

function hashSummaryInput(input: ReturnType<typeof buildSummaryInput>) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function canGenerateSummary(aiConfig: Awaited<ReturnType<typeof getAiConfig>>) {
  try {
    ensureAiSummaryConfig(aiConfig)
    return true
  } catch {
    return false
  }
}

function buildSummaryResponse(params: {
  state: CachedDashboardSummary
  currentHash: string | null
  canGenerate: boolean
  fromCache: boolean
}): AiDashboardSummaryDto {
  const hasContent = Boolean(params.state.content?.trim())
  const hashMatches = Boolean(params.currentHash && params.state.sourceDataHash === params.currentHash)
  const isFailed = params.state.status === 'failed'
  const isUnconfigured = params.state.status === 'unconfigured'

  return {
    scope: DASHBOARD_SUMMARY_SCOPE,
    status: params.state.status,
    content: params.state.content,
    previewContent: params.state.previewContent,
    errorMessage: params.state.errorMessage,
    generatedAt: params.state.generatedAt,
    updatedAt: params.state.updatedAt,
    sourceDataHash: params.state.sourceDataHash,
    fromCache: params.fromCache,
    isStale: hasContent ? !hashMatches : false,
    canGenerate: params.canGenerate,
    needsGeneration: params.canGenerate && (!hasContent || !hashMatches || isFailed || isUnconfigured)
  }
}

function buildUnconfiguredSummaryState(
  state: CachedDashboardSummary,
  aiConfig: Awaited<ReturnType<typeof getAiConfig>>
): CachedDashboardSummary {
  return {
    ...state,
    status: 'unconfigured',
    content: null,
    previewContent: null,
    generatedAt: null,
    sourceDataHash: null,
    errorMessage: inferUnconfiguredMessage(aiConfig)
  }
}

async function requestDashboardSummaryPreviewMarkdown(params: {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  summaryMarkdown: string
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(params.timeoutMs, 20000))

  try {
    const response = await fetch(`${params.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: resolveDashboardSummaryPreviewPrompt()
          },
          {
            role: 'user',
            content: `以下是已经生成好的完整 AI 总结，请提炼一个默认折叠展示用的超简短摘要：\n\n${params.summaryMarkdown}`
          }
        ]
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI 摘要提炼失败：${response.status}${errorText ? ` - ${errorText}` : ''}`)
    }

    const payload = (await response.json()) as ChatCompletionPayload
    const previewMarkdown = extractChatCompletionText(payload)

    if (!previewMarkdown.trim()) {
      throw new Error('AI 摘要提炼返回空内容')
    }

    return previewMarkdown
  } finally {
    clearTimeout(timeout)
  }
}

async function requestDashboardSummaryMarkdown(params: {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  promptTemplate?: string | null
  input: ReturnType<typeof buildSummaryInput>
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(params.timeoutMs, 45000))

  try {
    const response = await fetch(`${params.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: resolveDashboardSummaryPrompt(params.promptTemplate)
          },
          {
            role: 'user',
            content: `以下是当前订阅统计数据，请输出 Markdown 总结：\n\n${JSON.stringify(params.input, null, 2)}`
          }
        ]
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI 接口请求失败：${response.status}${errorText ? ` - ${errorText}` : ''}`)
    }

    const payload = (await response.json()) as ChatCompletionPayload
    const markdown = extractChatCompletionText(payload)

    if (!markdown.trim()) {
      throw new Error('AI 总结返回空内容')
    }

    return markdown
  } finally {
    clearTimeout(timeout)
  }
}

export async function getDashboardAiSummary(): Promise<AiDashboardSummaryDto> {
  const [aiConfig, overview, cachedState] = await Promise.all([
    getAiConfig(),
    getOverviewStatistics(),
    getDashboardSummaryCacheState()
  ])
  const summaryInput = buildSummaryInput(overview)
  const currentHash = hashSummaryInput(summaryInput)
  const canGenerate = canGenerateSummary(aiConfig)

  if (!canGenerate) {
    const unconfiguredState = buildUnconfiguredSummaryState(cachedState, aiConfig)
    await persistDashboardSummaryCache(unconfiguredState)
    return buildSummaryResponse({
      state: unconfiguredState,
      currentHash,
      canGenerate: false,
      fromCache: true
    })
  }

  return buildSummaryResponse({
    state: cachedState,
    currentHash,
    canGenerate: true,
    fromCache: true
  })
}

export async function generateDashboardAiSummary(): Promise<AiDashboardSummaryDto> {
  if (inflightGeneratePromise) {
    return inflightGeneratePromise
  }

  inflightGeneratePromise = (async () => {
    const [aiConfig, overview, cachedState] = await Promise.all([
      getAiConfig(),
      getOverviewStatistics(),
      getDashboardSummaryCacheState()
    ])
    const summaryInput = buildSummaryInput(overview)
    const currentHash = hashSummaryInput(summaryInput)
    const canGenerate = canGenerateSummary(aiConfig)

    if (!canGenerate) {
      const unconfiguredState = buildUnconfiguredSummaryState(cachedState, aiConfig)
      await persistDashboardSummaryCache(unconfiguredState)
      return buildSummaryResponse({
        state: unconfiguredState,
        currentHash,
        canGenerate: false,
        fromCache: false
      })
    }

    const { claimed, ownerId } = await claimDashboardSummaryGenerationLock()
    if (!claimed) {
      const generatingState: CachedDashboardSummary = {
        ...cachedState,
        status: 'generating',
        errorMessage: null,
        sourceDataHash: currentHash,
        updatedAt: new Date().toISOString()
      }
      updateMemoryDashboardSummaryCache(generatingState)

      const latestState = await getDashboardSummaryCacheState(true)
      return buildSummaryResponse({
        state: latestState.status === 'idle' ? generatingState : latestState,
        currentHash,
        canGenerate: true,
        fromCache: true
      })
    }

    updateMemoryDashboardSummaryCache({
      ...cachedState,
      status: 'generating',
      errorMessage: null,
      sourceDataHash: currentHash,
      updatedAt: new Date().toISOString()
    })

    try {
      const markdown = await requestDashboardSummaryMarkdown({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        timeoutMs: aiConfig.timeoutMs,
        promptTemplate: aiConfig.dashboardSummaryPromptTemplate,
        input: summaryInput
      })

      let previewContent: string
      try {
        const previewMarkdown = await requestDashboardSummaryPreviewMarkdown({
          baseUrl: aiConfig.baseUrl,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          timeoutMs: aiConfig.timeoutMs,
          summaryMarkdown: markdown
        })
        previewContent = formatAiSummaryPreviewText(previewMarkdown)
      } catch {
        previewContent = formatAiSummaryPreviewText(markdown)
      }

      const now = new Date().toISOString()
      const persistedState: CachedDashboardSummary = {
        scope: DASHBOARD_SUMMARY_SCOPE,
        status: 'success',
        content: markdown,
        previewContent,
        errorMessage: null,
        generatedAt: now,
        updatedAt: now,
        sourceDataHash: currentHash
      }
      await persistDashboardSummaryCache(persistedState)

      return buildSummaryResponse({
        state: persistedState,
        currentHash,
        canGenerate: true,
        fromCache: false
      })
    } catch (error) {
      const failedState: CachedDashboardSummary = {
        ...cachedState,
        scope: DASHBOARD_SUMMARY_SCOPE,
        status: 'failed',
        content: null,
        previewContent: null,
        errorMessage: error instanceof Error ? error.message : 'AI 总结生成失败',
        generatedAt: null,
        updatedAt: new Date().toISOString(),
        sourceDataHash: currentHash
      }
      await persistDashboardSummaryCache(failedState)
      return buildSummaryResponse({
        state: failedState,
        currentHash,
        canGenerate: true,
        fromCache: false
      })
    } finally {
      await releaseDashboardSummaryGenerationLock(ownerId)
      inflightGeneratePromise = null
    }
  })()

  return inflightGeneratePromise
}

export function resetDashboardAiSummaryCacheForTests() {
  dashboardSummaryCache = null
  inflightGeneratePromise = null
}
