import { z } from 'zod'

export const DEFAULT_AI_SUBSCRIPTION_PROMPT = `你是订阅账单信息提取助手。请从输入的文本或截图中提取订阅信息，并且只返回 JSON。
输出字段：
- name
- description
- amount
- currency
- billingIntervalCount
- billingIntervalUnit(day|week|month|quarter|year)
- startDate(YYYY-MM-DD)
- nextRenewalDate(YYYY-MM-DD)
- notifyDaysBefore
- websiteUrl
- notes
- confidence(0~1)
- rawText

规则：
1. 不确定就留空，不要猜。
2. 金额必须是数字。
3. 币种必须是 3 位大写代码，例如 CNY、USD。
4. 周期单位必须在 day/week/month/quarter/year 中。
5. 只返回 JSON，不要返回 Markdown。`

export const DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT = `你是订阅运营摘要助手。请基于用户当前的订阅统计数据，输出一份简洁、准确、可执行的 Markdown 总结。

目标：
1. 帮助用户快速理解当前订阅规模、支出结构、预算压力和近期续订风险。
2. 总结数据中的明显模式、异常点和需要关注的事项。
3. 给出中性、可执行、但不依赖具体服务功能知识的建议。

硬性要求：
- 只能基于输入数据分析，不要虚构事实。
- 不要假设你了解某个订阅服务的功能细节。
- 不要输出“取消某服务更省钱”“某两个服务功能重叠”之类的建议。
- 不要臆测用户偏好、使用频率或用途。
- 不要输出 JSON，不要输出代码块，只输出 Markdown 正文。

输出建议结构：
## 总览
## 支出结构
## 近期风险
## 值得注意的模式
## 中性建议

写作要求：
- 使用简体中文。
- 结论明确，少空话。
- 每个小节控制在 2~5 条要点内。
- 如果某部分没有明显异常，直接说明“暂无显著异常”或“整体平稳”。`

export const DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT = `你是订阅统计摘要压缩助手。请根据已经生成好的完整 AI 总结，提炼出一个默认折叠展示用的超简短摘要。

硬性要求：
- 只输出简体中文纯文本，不要输出 Markdown，不要输出代码块。
- 输出 2 到 3 行，每行一句，自然换行。
- 不要输出标题，不要输出项目符号，不要编号。
- 只保留最重要的结论：订阅规模、预算压力、近期风险。
- 不要发散，不要补充原文没有的信息。
- 如果原文信息有限，就直接给出 1 到 2 句自然语言摘要。`

function normalizePreviewSource(text: string) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/g, '')
        .replace(/^\s*[-*+]\s*/g, '')
        .replace(/^\s*\d+[.)]\s*/g, '')
        .replace(/[`>*_]/g, '')
        .trim()
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatAiSummaryPreviewText(text: string) {
  return normalizePreviewSource(text)
}

export const SubscriptionStatusSchema = z.enum(['active', 'paused', 'cancelled', 'expired'])
export const BillingIntervalUnitSchema = z.enum(['day', 'week', 'month', 'quarter', 'year'])
export const WebhookRequestMethodSchema = z.enum(['POST', 'PUT', 'PATCH', 'DELETE'])
export const WebhookEventTypeSchema = z.enum([
  'subscription.reminder_due',
  'subscription.overdue'
])

export const DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE = `{
  "phase": "{{phase}}",
  "daysUntilRenewal": {{days_until}},
  "daysOverdue": {{days_overdue}},
  "subscription": {
    "id": "{{subscription_id}}",
    "name": "{{subscription_name}}",
    "amount": "{{subscription_amount}}",
    "currency": "{{subscription_currency}}",
    "nextRenewalDate": "{{subscription_next_renewal_date}}",
    "tags": "{{subscription_tags}}",
    "url": "{{subscription_url}}",
    "notes": "{{subscription_notes}}"
  }
}`

export const DEFAULT_REMINDER_RULE_TIME = '09:30'
export const DEFAULT_ADVANCE_REMINDER_RULES = `3&${DEFAULT_REMINDER_RULE_TIME};0&${DEFAULT_REMINDER_RULE_TIME};`
export const DEFAULT_OVERDUE_REMINDER_RULES = `1&${DEFAULT_REMINDER_RULE_TIME};2&${DEFAULT_REMINDER_RULE_TIME};3&${DEFAULT_REMINDER_RULE_TIME};`
export const DEFAULT_TIMEZONE = 'Asia/Shanghai'

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export const TimeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => isValidTimeZone(value), 'Invalid timezone')

export const TagSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(100),
  color: z.string().min(4).max(20).default('#3b82f6'),
  icon: z.string().max(50).default('apps-outline'),
  sortOrder: z.number().int().default(0)
})

const OptionalMoneySchema = z.number().nonnegative().nullable().optional()

export const SubscriptionLogoSchema = z.object({
  websiteUrl: z.string().url().nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  logoSource: z.string().max(100).nullable().optional()
})

export const CreateSubscriptionSchema = z
  .object({
    name: z.string().min(1).max(150),
    tagIds: z.array(z.string().cuid()).default([]),
    description: z.string().max(500).default(''),
    amount: z.number().nonnegative(),
    currency: z.string().length(3).transform((v) => v.toUpperCase()),
    billingIntervalCount: z.number().int().positive().default(1),
    billingIntervalUnit: BillingIntervalUnitSchema,
    autoRenew: z.boolean().default(false),
    startDate: z.string().date(),
    nextRenewalDate: z.string().date(),
    notifyDaysBefore: z.number().int().min(0).max(365).default(3),
    advanceReminderRules: z.string().max(500).optional(),
    overdueReminderRules: z.string().max(500).optional(),
    webhookEnabled: z.boolean().default(true),
    notes: z.string().max(1000).default('')
  })
  .merge(SubscriptionLogoSchema)

export const UpdateSubscriptionSchema = CreateSubscriptionSchema.partial().extend({
  status: SubscriptionStatusSchema.optional()
})

export const RenewSubscriptionSchema = z.object({
  paidAt: z.string().date().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional()
})

export const DEFAULT_RESEND_API_URL = 'https://api.resend.com/emails'

export const EmailProviderSchema = z.enum(['smtp', 'resend'])

export const EmailConfigSchema = z.object({
  host: z.string().max(200).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().max(200).default(''),
  password: z.string().max(500).default(''),
  from: z.string().max(200).default(''),
  to: z.string().max(500).default('')
})

export const ResendConfigSchema = z.object({
  apiBaseUrl: z.string().url().default(DEFAULT_RESEND_API_URL),
  apiKey: z.string().max(500).default(''),
  from: z.string().max(200).default(''),
  to: z.string().max(500).default('')
})

export const PushPlusConfigSchema = z.object({
  token: z.string().max(200).default(''),
  topic: z.string().max(100).default('')
})

export const TelegramConfigSchema = z.object({
  botToken: z.string().max(500).default(''),
  chatId: z.string().max(200).default('')
})

export const ServerchanConfigSchema = z.object({
  sendkey: z.string().max(200).default('')
})

export const GotifyConfigSchema = z.object({
  url: z.string().trim().max(500).default(''),
  token: z.string().max(500).default(''),
  ignoreSsl: z.boolean().default(false)
})

export const AiProviderPresetSchema = z.enum(['custom', 'aliyun-bailian', 'tencent-hunyuan', 'volcengine-ark'])

export const DEFAULT_AI_CAPABILITIES = {
  vision: false,
  structuredOutput: true
} as const

export const DEFAULT_AI_CONFIG = {
  enabled: false,
  dashboardSummaryEnabled: false,
  providerPreset: 'custom',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  timeoutMs: 30000,
  promptTemplate: '',
  dashboardSummaryPromptTemplate: '',
  capabilities: {
    ...DEFAULT_AI_CAPABILITIES
  }
} as const

export const NotificationWebhookSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().trim().max(500).default(''),
  requestMethod: WebhookRequestMethodSchema.default('POST'),
  headers: z.string().max(4000).default('Content-Type: application/json'),
  payloadTemplate: z.string().max(20000).default(DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE),
  ignoreSsl: z.boolean().default(false)
})

export const AiCapabilitiesSchema = z.object({
  vision: z.boolean().default(DEFAULT_AI_CAPABILITIES.vision),
  structuredOutput: z.boolean().default(DEFAULT_AI_CAPABILITIES.structuredOutput)
})

export const AiConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_AI_CONFIG.enabled),
  dashboardSummaryEnabled: z.boolean().default(DEFAULT_AI_CONFIG.dashboardSummaryEnabled),
  providerPreset: AiProviderPresetSchema.default(DEFAULT_AI_CONFIG.providerPreset),
  providerName: z.string().max(100).default(DEFAULT_AI_CONFIG.providerName),
  baseUrl: z.string().url().default(DEFAULT_AI_CONFIG.baseUrl),
  apiKey: z.string().max(500).default(DEFAULT_AI_CONFIG.apiKey),
  model: z.string().max(100).default(DEFAULT_AI_CONFIG.model),
  timeoutMs: z.number().int().min(5000).max(120000).default(DEFAULT_AI_CONFIG.timeoutMs),
  promptTemplate: z.string().max(5000).default(DEFAULT_AI_CONFIG.promptTemplate),
  dashboardSummaryPromptTemplate: z.string().max(5000).default(DEFAULT_AI_CONFIG.dashboardSummaryPromptTemplate),
  capabilities: AiCapabilitiesSchema.default({
    ...DEFAULT_AI_CAPABILITIES
  })
})

export const StorageCapabilitiesSchema = z.object({
  runtime: z.literal('worker-lite').default('worker-lite'),
  r2Enabled: z.boolean().default(false),
  logoStorageEnabled: z.boolean().default(false),
  wallosImportMode: z.enum(['json-only', 'json-db-zip']).default('json-db-zip')
})

export const SettingsSchema = z.object({
  baseCurrency: z.string().length(3).default('CNY').transform((v) => v.toUpperCase()),
  timezone: TimeZoneSchema.default(DEFAULT_TIMEZONE),
  defaultNotifyDays: z.number().int().min(0).max(365).default(3),
  defaultAdvanceReminderRules: z.string().max(500).default(DEFAULT_ADVANCE_REMINDER_RULES),
  rememberSessionDays: z.number().int().min(1).max(365).default(7),
  forgotPasswordEnabled: z.boolean().default(false),
  notifyOnDueDay: z.boolean().default(true),
  mergeMultiSubscriptionNotifications: z.boolean().default(true),
  monthlyBudgetBase: OptionalMoneySchema,
  yearlyBudgetBase: OptionalMoneySchema,
  enableTagBudgets: z.boolean().default(false),
  overdueReminderDays: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).default([1, 2, 3]),
  defaultOverdueReminderRules: z.string().max(500).default(DEFAULT_OVERDUE_REMINDER_RULES),
  tagBudgets: z.record(z.string(), z.number().nonnegative()).default({}),
  emailNotificationsEnabled: z.boolean().default(false),
  emailProvider: EmailProviderSchema.default('smtp'),
  pushplusNotificationsEnabled: z.boolean().default(false),
  telegramNotificationsEnabled: z.boolean().default(false),
  serverchanNotificationsEnabled: z.boolean().default(false),
  gotifyNotificationsEnabled: z.boolean().default(false),
  smtpConfig: EmailConfigSchema.default({}),
  resendConfig: ResendConfigSchema.default({}),
  pushplusConfig: PushPlusConfigSchema.default({}),
  telegramConfig: TelegramConfigSchema.default({}),
  serverchanConfig: ServerchanConfigSchema.default({}),
  gotifyConfig: GotifyConfigSchema.default({}),
  aiConfig: AiConfigSchema.default({}),
  storageCapabilities: StorageCapabilitiesSchema.default({})
})

export const LoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional().default(false),
  rememberDays: z.number().int().min(1).max(365).optional()
})

export const ChangeCredentialsSchema = z.object({
  oldUsername: z.string().min(1).max(100),
  oldPassword: z.string().min(1).max(200),
  newUsername: z.string().min(1).max(100),
  newPassword: z.string().min(4).max(200)
})

export const ForgotPasswordRequestSchema = z.object({
  username: z.string().min(1).max(100)
})

export const ForgotPasswordResetSchema = z.object({
  username: z.string().min(1).max(100),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, '验证码必须为 6 位数字'),
  newPassword: z.string().min(4).max(200)
})

export const LogoSearchSchema = z.object({
  name: z.string().min(1).max(150),
  websiteUrl: z.string().url().optional(),
  tagName: z.string().max(100).optional()
})

export const LogoUploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  base64: z.string().min(1)
})

export const AiRecognizeSubscriptionSchema = z.object({
  text: z.string().max(8000).optional(),
  imageBase64: z.string().max(10_000_000).optional(),
  filename: z.string().max(200).optional(),
  mimeType: z.string().max(100).optional()
})

export const AiDashboardSummaryStatusSchema = z.enum([
  'idle',
  'unconfigured',
  'generating',
  'success',
  'failed'
])

const WallosImportSummarySchema = z.object({
  fileType: z.enum(['json', 'db', 'zip']),
  subscriptionsTotal: z.number().int().min(0),
  tagsTotal: z.number().int().min(0),
  usedTagsTotal: z.number().int().min(0),
  supportedSubscriptions: z.number().int().min(0),
  skippedSubscriptions: z.number().int().min(0),
  globalNotifyDays: z.number().int().min(0).max(365),
  zipLogoMatched: z.number().int().min(0),
  zipLogoMissing: z.number().int().min(0)
})

const WallosImportTagSchema = z.object({
  sourceId: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().min(0)
})

const WallosImportSubscriptionPreviewSchema = z.object({
  sourceId: z.number().int().nonnegative(),
  name: z.string().min(1).max(200),
  amount: z.number().finite(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  status: SubscriptionStatusSchema,
  autoRenew: z.boolean(),
  billingIntervalCount: z.number().int().positive(),
  billingIntervalUnit: BillingIntervalUnitSchema,
  startDate: z.string().min(10).max(30),
  nextRenewalDate: z.string().min(10).max(30),
  notifyDaysBefore: z.number().int().min(0).max(365),
  advanceReminderRules: z.string().max(500).nullable().optional(),
  overdueReminderRules: z.string().max(500).nullable().optional(),
  webhookEnabled: z.boolean(),
  notes: z.string().max(5000),
  description: z.string().max(2000),
  websiteUrl: z.string().url().nullable().optional(),
  tagNames: z.array(z.string().min(1).max(120)).max(50),
  logoRef: z.string().min(1).max(255).nullable().optional(),
  logoImportStatus: z.enum(['none', 'pending-file-match', 'ready-from-zip']),
  warnings: z.array(z.string().max(500)).max(200)
})

const WallosImportPreparedPreviewSchema = z.object({
  isWallos: z.literal(true),
  summary: WallosImportSummarySchema,
  tags: z.array(WallosImportTagSchema).max(500),
  usedTags: z.array(WallosImportTagSchema).max(500),
  subscriptionsPreview: z.array(WallosImportSubscriptionPreviewSchema).max(5000),
  warnings: z.array(z.string().max(500)).max(2000)
})

const WallosImportLogoAssetSchema = z.object({
  filename: z.string().min(1).max(255),
  logoRef: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  base64: z.string().min(1)
})

export const WallosImportInspectSchema = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.enum(['json', 'db', 'zip']),
  preview: WallosImportPreparedPreviewSchema,
  logoAssets: z.array(WallosImportLogoAssetSchema).max(500).default([])
})

export const WallosImportCommitSchema = z.object({
  importToken: z.string().min(10).max(200),
  preview: WallosImportPreparedPreviewSchema.optional()
})

export const SubtrackerBackupScopeSchema = z.enum(['business-complete'])
export const SubtrackerBackupRestoreModeSchema = z.enum(['replace', 'append'])

export const SubtrackerBackupInspectSchema = z.object({
  filename: z.string().min(1).max(255),
  manifest: z.unknown(),
  logoAssets: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(120),
        base64: z.string().min(1)
      })
    )
    .max(500)
    .default([])
})

export const SubtrackerBackupCommitSchema = z.object({
  importToken: z.string().min(10).max(200),
  mode: SubtrackerBackupRestoreModeSchema,
  restoreSettings: z.boolean().default(false)
})

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>
export type BillingIntervalUnit = z.infer<typeof BillingIntervalUnitSchema>
export type WebhookRequestMethod = z.infer<typeof WebhookRequestMethodSchema>
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>
export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionSchema>
export type RenewSubscriptionInput = z.infer<typeof RenewSubscriptionSchema>
export type SettingsInput = z.infer<typeof SettingsSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type ChangeCredentialsInput = z.infer<typeof ChangeCredentialsSchema>
export type ForgotPasswordRequestInput = z.infer<typeof ForgotPasswordRequestSchema>
export type ForgotPasswordResetInput = z.infer<typeof ForgotPasswordResetSchema>
export type EmailProvider = z.infer<typeof EmailProviderSchema>
export type EmailConfigInput = z.infer<typeof EmailConfigSchema>
export type ResendConfigInput = z.infer<typeof ResendConfigSchema>
export type PushPlusConfigInput = z.infer<typeof PushPlusConfigSchema>
export type TelegramConfigInput = z.infer<typeof TelegramConfigSchema>
export type ServerchanConfigInput = z.infer<typeof ServerchanConfigSchema>
export type GotifyConfigInput = z.infer<typeof GotifyConfigSchema>
export type NotificationWebhookSettingsInput = z.infer<typeof NotificationWebhookSettingsSchema>
export type AiProviderPreset = z.infer<typeof AiProviderPresetSchema>
export type AiCapabilitiesInput = z.infer<typeof AiCapabilitiesSchema>
export type AiConfigInput = z.infer<typeof AiConfigSchema>
export type StorageCapabilitiesInput = z.infer<typeof StorageCapabilitiesSchema>
export type LogoSearchInput = z.infer<typeof LogoSearchSchema>
export type LogoUploadInput = z.infer<typeof LogoUploadSchema>
export type AiRecognizeSubscriptionInput = z.infer<typeof AiRecognizeSubscriptionSchema>
export type AiDashboardSummaryStatus = z.infer<typeof AiDashboardSummaryStatusSchema>
export type WallosImportInspectInput = z.infer<typeof WallosImportInspectSchema>
export type WallosImportCommitInput = z.infer<typeof WallosImportCommitSchema>
export type SubtrackerBackupScope = z.infer<typeof SubtrackerBackupScopeSchema>
export type SubtrackerBackupRestoreMode = z.infer<typeof SubtrackerBackupRestoreModeSchema>
export type SubtrackerBackupInspectInput = z.infer<typeof SubtrackerBackupInspectSchema>
export type SubtrackerBackupCommitInput = z.infer<typeof SubtrackerBackupCommitSchema>

export interface MoneyDto {
  amount: number
  currency: string
}

export interface ExchangeRateSnapshotDto {
  baseCurrency: string
  rates: Record<string, number>
  fetchedAt: string
  provider: string
  providerUrl: string
  isStale: boolean
}

export interface LogoSearchResultDto {
  label: string
  logoUrl: string
  source: string
  websiteUrl?: string
  width?: number
  height?: number
  isLocal?: boolean
  usageCount?: number
  filename?: string
  updatedAt?: string
  relatedSubscriptionNames?: string[]
}

export interface AiRecognitionResultDto {
  name?: string
  description?: string
  amount?: number
  currency?: string
  billingIntervalCount?: number
  billingIntervalUnit?: BillingIntervalUnit
  startDate?: string
  nextRenewalDate?: string
  notifyDaysBefore?: number
  advanceReminderRules?: string
  overdueReminderRules?: string
  websiteUrl?: string
  notes?: string
  confidence?: number
  rawText?: string
}

export interface AiDashboardSummaryDto {
  scope: 'dashboard-overview'
  status: AiDashboardSummaryStatus
  content: string | null
  previewContent: string | null
  errorMessage: string | null
  generatedAt: string | null
  updatedAt: string | null
  sourceDataHash: string | null
  fromCache: boolean
  isStale: boolean
  canGenerate: boolean
  needsGeneration: boolean
}

export interface ReleaseUpdateDto {
  tagName: string
  version: string
  name: string
  body: string
  htmlUrl: string
  publishedAt: string
  isPrerelease: boolean
}

export interface VersionUpdateSummaryDto {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releases: ReleaseUpdateDto[]
}

export interface DashboardOverview {
  activeSubscriptions: number
  upcoming7Days: number
  upcoming30Days: number
  monthlyEstimatedBase: number
  yearlyEstimatedBase: number
  monthlyBudgetBase?: number | null
  yearlyBudgetBase?: number | null
  monthlyBudgetUsageRatio?: number | null
  yearlyBudgetUsageRatio?: number | null
  tagSpend: Array<{ name: string; value: number }>
  monthlyTrend: Array<{ month: string; amount: number }>
  monthlyTrendMeta: {
    mode: 'projected'
    months: number
  }
  budgetSummary: {
    monthly: {
      spent: number
      budget: number | null
      ratio: number | null
      overBudget: number
      status: 'normal' | 'warning' | 'over'
    }
    yearly: {
      spent: number
      budget: number | null
      ratio: number | null
      overBudget: number
      status: 'normal' | 'warning' | 'over'
    }
  }
  tagBudgetSummary?: {
    configuredCount: number
    warningCount: number
    overBudgetCount: number
    topTags: Array<{
      tagId: string
      name: string
      budget: number
      spent: number
      ratio: number
      remaining: number
      overBudget: number
      status: 'normal' | 'warning' | 'over'
    }>
  } | null
  statusDistribution: Array<{ status: SubscriptionStatus; count: number }>
  renewalModeDistribution: Array<{ autoRenew: boolean; count: number; amount: number }>
  upcomingByDay: Array<{ date: string; count: number; amount: number }>
  tagBudgetUsage?: Array<{
    tagId: string
    name: string
    budget: number
    spent: number
    ratio: number
    remaining: number
    overBudget: number
    status: 'normal' | 'warning' | 'over'
  }>
  currencyDistribution: Array<{ currency: string; amount: number }>
  topSubscriptionsByMonthlyCost: Array<{
    id: string
    name: string
    amount: number
    currency: string
    monthlyAmountBase: number
    baseCurrency: string
  }>
  upcomingRenewals: Array<{
    id: string
    name: string
    nextRenewalDate: string
    amount: number
    currency: string
    convertedAmount: number
    status: SubscriptionStatus
  }>
}

export interface BudgetStatisticsDto {
  enabledTagBudgets: boolean
  budgetSummary: DashboardOverview['budgetSummary']
  tagBudgetSummary: DashboardOverview['tagBudgetSummary']
  tagBudgetUsage: NonNullable<DashboardOverview['tagBudgetUsage']>
}

export interface CalendarEventDto {
  id: string
  title: string
  date: string
  currency: string
  amount: number
  convertedAmount: number
  status: SubscriptionStatus
}

export interface WallosImportSummaryDto {
  fileType: 'json' | 'db' | 'zip'
  subscriptionsTotal: number
  tagsTotal: number
  usedTagsTotal: number
  supportedSubscriptions: number
  skippedSubscriptions: number
  globalNotifyDays: number
  zipLogoMatched: number
  zipLogoMissing: number
}

export interface WallosImportTagDto {
  sourceId: number
  name: string
  sortOrder: number
}

export interface WallosImportSubscriptionPreviewDto {
  sourceId: number
  name: string
  amount: number
  currency: string
  status: SubscriptionStatus
  autoRenew: boolean
  billingIntervalCount: number
  billingIntervalUnit: BillingIntervalUnit
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  advanceReminderRules?: string | null
  overdueReminderRules?: string | null
  webhookEnabled: boolean
  notes: string
  description: string
  websiteUrl?: string | null
  tagNames: string[]
  logoRef?: string | null
  logoImportStatus: 'none' | 'pending-file-match' | 'ready-from-zip'
  warnings: string[]
}

export interface WallosImportInspectResultDto {
  isWallos: boolean
  summary: WallosImportSummaryDto
  tags: WallosImportTagDto[]
  usedTags: WallosImportTagDto[]
  subscriptionsPreview: WallosImportSubscriptionPreviewDto[]
  warnings: string[]
  importToken: string
}

export interface WallosImportCommitResultDto {
  importedTags: number
  importedSubscriptions: number
  skippedSubscriptions: number
  importedLogos: number
  warnings: string[]
}

export interface PaymentRecordDto {
  id: string
  subscriptionId: string
  amount: number
  currency: string
  baseCurrency: string
  convertedAmount: number
  exchangeRate: number
  paidAt: string
  periodStart: string
  periodEnd: string
  createdAt: string
}

export interface SubtrackerBackupTagDto {
  id: string
  name: string
  color: string
  icon: string
  sortOrder: number
}

export interface SubtrackerBackupSubscriptionDto {
  id: string
  name: string
  description: string
  websiteUrl: string | null
  logoUrl: string | null
  logoSource: string | null
  logoFetchedAt: string | null
  status: SubscriptionStatus
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: BillingIntervalUnit
  autoRenew: boolean
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  advanceReminderRules: string | null
  overdueReminderRules: string | null
  webhookEnabled: boolean
  notes: string
  tagIds: string[]
  createdAt: string
  updatedAt: string
}

export interface SubtrackerBackupAssetLogoDto {
  path: string
  filename: string
  sourceLogoUrl: string
  contentType: string
  referencedBySubscriptionIds: string[]
}

export interface SubtrackerBackupManifestDto {
  schemaVersion: number
  exportedAt: string
  app: 'SubTracker'
  scope: SubtrackerBackupScope
  data: {
    settings: SettingsInput
    notificationWebhook: NotificationWebhookSettingsInput
    tags: SubtrackerBackupTagDto[]
    subscriptions: SubtrackerBackupSubscriptionDto[]
    paymentRecords: PaymentRecordDto[]
    subscriptionOrder: string[]
  }
  assets: {
    logos: SubtrackerBackupAssetLogoDto[]
  }
}

export interface SubtrackerBackupSummaryDto {
  scope: SubtrackerBackupScope
  subscriptionsTotal: number
  tagsTotal: number
  paymentRecordsTotal: number
  logosTotal: number
  includesSettings: boolean
}

export interface SubtrackerBackupInspectConflictsDto {
  existingTagNameCount: number
  existingSubscriptionIdCount: number
  existingPaymentRecordIdCount: number
  canRestoreSettings: boolean
}

export interface SubtrackerBackupInspectResultDto {
  isSubtrackerBackup: boolean
  summary: SubtrackerBackupSummaryDto
  warnings: string[]
  importToken: string
  availableModes: Array<SubtrackerBackupRestoreMode>
  conflicts: SubtrackerBackupInspectConflictsDto
}

export interface SubtrackerBackupCommitResultDto {
  mode: SubtrackerBackupRestoreMode
  clearedExistingData: boolean
  restoredSettings: boolean
  importedTags: number
  reusedTags: number
  importedSubscriptions: number
  skippedSubscriptions: number
  importedPaymentRecords: number
  skippedPaymentRecords: number
  importedLogos: number
  warnings: string[]
}
