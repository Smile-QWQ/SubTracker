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
  providerPreset: 'custom',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  timeoutMs: 30000,
  promptTemplate: '',
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
  providerPreset: AiProviderPresetSchema.default(DEFAULT_AI_CONFIG.providerPreset),
  providerName: z.string().max(100).default(DEFAULT_AI_CONFIG.providerName),
  baseUrl: z.string().url().default(DEFAULT_AI_CONFIG.baseUrl),
  apiKey: z.string().max(500).default(DEFAULT_AI_CONFIG.apiKey),
  model: z.string().max(100).default(DEFAULT_AI_CONFIG.model),
  timeoutMs: z.number().int().min(5000).max(120000).default(DEFAULT_AI_CONFIG.timeoutMs),
  promptTemplate: z.string().max(5000).default(DEFAULT_AI_CONFIG.promptTemplate),
  capabilities: AiCapabilitiesSchema.default({
    ...DEFAULT_AI_CAPABILITIES
  })
})

export const StorageCapabilitiesSchema = z.object({
  runtime: z.literal('worker-lite').default('worker-lite'),
  kvEnabled: z.boolean().default(false),
  r2Enabled: z.boolean().default(false),
  logoStorageEnabled: z.boolean().default(false),
  wallosImportMode: z.literal('json-only').default('json-only')
})

export const SettingsSchema = z.object({
  baseCurrency: z.string().length(3).default('CNY').transform((v) => v.toUpperCase()),
  defaultNotifyDays: z.number().int().min(0).max(365).default(3),
  defaultAdvanceReminderRules: z.string().max(500).default(DEFAULT_ADVANCE_REMINDER_RULES),
  rememberSessionDays: z.number().int().min(1).max(365).default(7),
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

export const WallosImportInspectSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  base64: z.string().min(1)
})

export const WallosImportCommitSchema = z.object({
  importToken: z.string().min(10).max(200)
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
export type WallosImportInspectInput = z.infer<typeof WallosImportInspectSchema>
export type WallosImportCommitInput = z.infer<typeof WallosImportCommitSchema>

export interface MoneyDto {
  amount: number
  currency: string
}

export interface ExchangeRateSnapshotDto {
  baseCurrency: string
  rates: Record<string, number>
  fetchedAt: string
  provider: string
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
