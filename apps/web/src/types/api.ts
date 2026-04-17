export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired'

export interface AuthUser {
  username: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface AuthUserResponse {
  user: AuthUser
}

export interface LoginPayload {
  username: string
  password: string
  rememberMe?: boolean
  rememberDays?: number
}

export interface LoginOptions {
  rememberSessionDays: number
}

export interface ChangeCredentialsPayload {
  oldUsername: string
  oldPassword: string
  newUsername: string
  newPassword: string
}

export interface Tag {
  id: string
  name: string
  color: string
  icon: string
  sortOrder: number
}

export interface Subscription {
  id: string
  name: string
  tags?: Tag[]
  description: string
  websiteUrl?: string | null
  logoUrl?: string | null
  logoSource?: string | null
  logoFetchedAt?: string | null
  status: SubscriptionStatus
  amount: number
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: 'day' | 'week' | 'month' | 'quarter' | 'year'
  autoRenew: boolean
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  webhookEnabled: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface SubscriptionDetail extends Subscription {}

export interface TagBudgetUsage {
  tagId: string
  name: string
  budget: number
  spent: number
  ratio: number
  remaining: number
  overBudget: number
  status: 'normal' | 'warning' | 'over'
}

export interface BudgetSummaryEntry {
  spent: number
  budget: number | null
  ratio: number | null
  overBudget: number
  status: 'normal' | 'warning' | 'over'
}

export interface BudgetSummary {
  monthly: BudgetSummaryEntry
  yearly: BudgetSummaryEntry
}

export interface TagBudgetSummary {
  configuredCount: number
  warningCount: number
  overBudgetCount: number
  topTags: TagBudgetUsage[]
}

export interface BudgetStatistics {
  enabledTagBudgets: boolean
  budgetSummary: BudgetSummary
  tagBudgetSummary: TagBudgetSummary | null
  tagBudgetUsage: TagBudgetUsage[]
}

export interface StatisticsOverview {
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
  budgetSummary: BudgetSummary
  tagBudgetSummary?: TagBudgetSummary | null
  statusDistribution: Array<{ status: SubscriptionStatus; count: number }>
  renewalModeDistribution: Array<{ autoRenew: boolean; count: number; amount: number }>
  upcomingByDay: Array<{ date: string; count: number; amount: number }>
  tagBudgetUsage?: TagBudgetUsage[]
  currencyDistribution: Array<{ currency: string; amount: number }>
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

export interface CalendarEvent {
  id: string
  title: string
  date: string
  currency: string
  amount: number
  convertedAmount: number
  status: SubscriptionStatus
}

export interface EmailConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  from: string
  to: string
}

export interface PushplusConfig {
  token: string
  topic: string
}

export interface AiConfig {
  enabled: boolean
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  promptTemplate: string
}

export interface Settings {
  baseCurrency: string
  defaultNotifyDays: number
  rememberSessionDays: number
  monthlyBudgetBase?: number | null
  yearlyBudgetBase?: number | null
  enableTagBudgets: boolean
  tagBudgets: Record<string, number>
  emailNotificationsEnabled: boolean
  pushplusNotificationsEnabled: boolean
  emailConfig: EmailConfig
  pushplusConfig: PushplusConfig
  aiConfig: AiConfig
}

export interface NotificationWebhookSettings {
  enabled: boolean
  url: string
  requestMethod: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: string
  payloadTemplate: string
  ignoreSsl: boolean
}

export interface ExchangeRateSnapshot {
  baseCurrency: string
  rates: Record<string, number>
  fetchedAt: string
  provider: string
  isStale: boolean
}

export interface LogoSearchResult {
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

export interface AiRecognitionResult {
  name?: string
  description?: string
  amount?: number
  currency?: string
  billingIntervalCount?: number
  billingIntervalUnit?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  startDate?: string
  nextRenewalDate?: string
  notifyDaysBefore?: number
  websiteUrl?: string
  notes?: string
  confidence?: number
  rawText?: string
}

export interface WallosImportSummary {
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

export interface WallosImportTag {
  sourceId: number
  name: string
  sortOrder: number
}

export interface WallosImportSubscriptionPreview {
  sourceId: number
  name: string
  amount: number
  currency: string
  status: SubscriptionStatus
  autoRenew: boolean
  billingIntervalCount: number
  billingIntervalUnit: 'day' | 'week' | 'month' | 'quarter' | 'year'
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  webhookEnabled: boolean
  notes: string
  description: string
  websiteUrl?: string | null
  tagNames: string[]
  logoRef?: string | null
  logoImportStatus: 'none' | 'pending-file-match' | 'ready-from-zip'
  warnings: string[]
}

export interface WallosImportInspectResult {
  isWallos: boolean
  summary: WallosImportSummary
  tags: WallosImportTag[]
  usedTags: WallosImportTag[]
  subscriptionsPreview: WallosImportSubscriptionPreview[]
  warnings: string[]
  importToken: string
}

export interface WallosImportCommitResult {
  importedTags: number
  importedSubscriptions: number
  skippedSubscriptions: number
  importedLogos: number
  warnings: string[]
}

export interface PaymentRecord {
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
