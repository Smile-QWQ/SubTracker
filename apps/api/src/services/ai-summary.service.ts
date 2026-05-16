import crypto from 'node:crypto'
import {
  DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT,
  DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT,
  formatAiSummaryPreviewText,
  type AiDashboardSummaryDto,
  type DashboardOverview
} from '@subtracker/shared'
import { ensureAiSummaryConfig } from './ai.service'
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

let dashboardSummaryCache: CachedDashboardSummary = {
  scope: DASHBOARD_SUMMARY_SCOPE,
  status: 'idle',
  content: null,
  previewContent: null,
  errorMessage: null,
  generatedAt: null,
  updatedAt: null,
  sourceDataHash: null
}

let inflightGeneratePromise: Promise<AiDashboardSummaryDto> | null = null

function inferUnconfiguredMessage(aiConfig: Awaited<ReturnType<typeof getAiConfig>>) {
  if (!aiConfig.dashboardSummaryEnabled) return 'AI 总结未启用'
  if (!aiConfig.enabled) return 'AI 能力未启用'
  return 'AI 总结配置不完整'
}

function logAiSummary(stage: string, details?: Record<string, unknown>) {
  if (!details) {
    console.log(`[ai-summary] ${stage}`)
    return
  }

  console.log(`[ai-summary] ${stage}`, details)
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
  const tagSpendTop = [...overview.tagSpend]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 6)
  const renewalModeDistribution = overview.renewalModeDistribution.filter((item) => item.count > 0 || item.amount > 0)
  const currencyDistribution = overview.currencyDistribution
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency, 'en'))
    .slice(0, 8)
  const upcomingRenewalsTop = overview.upcomingRenewals.slice(0, 6)
  const topSubscriptionsByMonthlyCost = overview.topSubscriptionsByMonthlyCost.slice(0, 6)
  const upcomingByDayNonZero = overview.upcomingByDay
    .filter((item) => item.count > 0 || item.amount > 0)
    .slice(0, 10)
  const tagBudgetUsageTop = (overview.tagBudgetUsage ?? [])
    .filter((item) => item.ratio > 0 || item.spent > 0)
    .sort((a, b) => b.ratio - a.ratio || b.spent - a.spent)
    .slice(0, 6)

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
    tagSpendTop,
    statusDistribution: overview.statusDistribution,
    renewalModeDistribution,
    currencyDistribution,
    upcomingRenewalsTop,
    topSubscriptionsByMonthlyCost,
    upcomingByDayNonZero,
    tagBudgetSummary: overview.tagBudgetSummary ?? null,
    tagBudgetUsageTop
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
  currentHash: string | null
  canGenerate: boolean
  fromCache: boolean
}): AiDashboardSummaryDto {
  const hasContent = Boolean(dashboardSummaryCache.content?.trim())
  const hashMatches = Boolean(params.currentHash && dashboardSummaryCache.sourceDataHash === params.currentHash)
  const isFailed = dashboardSummaryCache.status === 'failed'
  const isUnconfigured = dashboardSummaryCache.status === 'unconfigured'

  return {
    scope: DASHBOARD_SUMMARY_SCOPE,
    status: dashboardSummaryCache.status,
    content: dashboardSummaryCache.content,
    previewContent: dashboardSummaryCache.previewContent,
    errorMessage: dashboardSummaryCache.errorMessage,
    generatedAt: dashboardSummaryCache.generatedAt,
    updatedAt: dashboardSummaryCache.updatedAt,
    sourceDataHash: dashboardSummaryCache.sourceDataHash,
    fromCache: params.fromCache,
    isStale: hasContent ? !hashMatches : false,
    canGenerate: params.canGenerate,
    needsGeneration: params.canGenerate && (!hasContent || !hashMatches || isFailed || isUnconfigured)
  }
}

function setCacheState(next: Partial<CachedDashboardSummary>) {
  const now = new Date().toISOString()
  dashboardSummaryCache = {
    ...dashboardSummaryCache,
    ...next,
    updatedAt: now
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
  const [aiConfig, overview] = await Promise.all([getAiConfig(), getOverviewStatistics()])
  const summaryInput = buildSummaryInput(overview)
  const currentHash = hashSummaryInput(summaryInput)
  const canGenerate = canGenerateSummary(aiConfig)

  if (!canGenerate) {
    setCacheState({
      status: 'unconfigured',
      content: null,
      previewContent: null,
      errorMessage: inferUnconfiguredMessage(aiConfig),
      sourceDataHash: currentHash,
      generatedAt: null
    })
    return buildSummaryResponse({
      currentHash,
      canGenerate: false,
      fromCache: true
    })
  }

  if (dashboardSummaryCache.status === 'generating' && inflightGeneratePromise) {
    return buildSummaryResponse({
      currentHash,
      canGenerate: true,
      fromCache: true
    })
  }

  return buildSummaryResponse({
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
    const [aiConfig, overview] = await Promise.all([getAiConfig(), getOverviewStatistics()])
    const summaryInput = buildSummaryInput(overview)
    const currentHash = hashSummaryInput(summaryInput)
    const canGenerate = canGenerateSummary(aiConfig)

    logAiSummary('generate:start', {
      canGenerate,
      activeSubscriptions: overview.activeSubscriptions,
      upcoming30Days: overview.upcoming30Days,
      monthlyEstimatedBase: overview.monthlyEstimatedBase,
      sourceDataHash: currentHash
    })

    if (!canGenerate) {
      setCacheState({
        status: 'unconfigured',
        content: null,
        previewContent: null,
        errorMessage: inferUnconfiguredMessage(aiConfig),
        sourceDataHash: currentHash,
        generatedAt: null
      })
      logAiSummary('generate:unconfigured')
      return buildSummaryResponse({
        currentHash,
        canGenerate: false,
        fromCache: false
      })
    }

    setCacheState({
      status: 'generating',
      errorMessage: null,
      sourceDataHash: currentHash
    })

    try {
      logAiSummary('model:request', {
        model: aiConfig.model,
        providerName: aiConfig.providerName
      })

      const markdown = await requestDashboardSummaryMarkdown({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        timeoutMs: aiConfig.timeoutMs,
        promptTemplate: aiConfig.dashboardSummaryPromptTemplate,
        input: summaryInput
      })

      const previewMarkdown = await requestDashboardSummaryPreviewMarkdown({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        timeoutMs: aiConfig.timeoutMs,
        summaryMarkdown: markdown
      }).catch(() => formatAiSummaryPreviewText(markdown))

      const now = new Date().toISOString()
      dashboardSummaryCache = {
        scope: DASHBOARD_SUMMARY_SCOPE,
        status: 'success',
        content: markdown,
        previewContent: formatAiSummaryPreviewText(previewMarkdown),
        errorMessage: null,
        generatedAt: now,
        updatedAt: now,
        sourceDataHash: currentHash
      }

      logAiSummary('persist:success', {
        sourceDataHash: currentHash,
        contentLength: markdown.length,
        previewLength: previewMarkdown.length
      })

      return buildSummaryResponse({
        currentHash,
        canGenerate: true,
        fromCache: false
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 总结生成失败'
      setCacheState({
        status: 'failed',
        content: null,
        previewContent: null,
        errorMessage: message,
        sourceDataHash: currentHash,
        generatedAt: null
      })
      logAiSummary('generate:failed', {
        sourceDataHash: currentHash,
        error: message
      })
      return buildSummaryResponse({
        currentHash,
        canGenerate: true,
        fromCache: false
      })
    }
  })()

  try {
    return await inflightGeneratePromise
  } finally {
    inflightGeneratePromise = null
  }
}

export function resetDashboardAiSummaryCacheForTests() {
  dashboardSummaryCache = {
    scope: DASHBOARD_SUMMARY_SCOPE,
    status: 'idle',
    content: null,
    previewContent: null,
    errorMessage: null,
    generatedAt: null,
    updatedAt: null,
    sourceDataHash: null
  }
  inflightGeneratePromise = null
}
