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
}

export interface ChangeCredentialsPayload {
  oldUsername: string
  oldPassword: string
  newUsername: string
  newPassword: string
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
  sortOrder: number
}

export interface Subscription {
  id: string
  name: string
  categoryId?: string | null
  category?: Category | null
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
  startDate: string
  nextRenewalDate: string
  notifyDaysBefore: number
  webhookEnabled: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface SubscriptionDetail extends Subscription {}

export interface CategoryBudgetUsage {
  categoryId: string
  name: string
  budget: number
  spent: number
  ratio: number
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
  categorySpend: Array<{ name: string; value: number }>
  monthlyTrend: Array<{ month: string; amount: number }>
  categoryBudgetUsage?: CategoryBudgetUsage[]
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
  monthlyBudgetBase?: number | null
  yearlyBudgetBase?: number | null
  enableCategoryBudgets: boolean
  categoryBudgets: Record<string, number>
  emailNotificationsEnabled: boolean
  pushplusNotificationsEnabled: boolean
  emailConfig: EmailConfig
  pushplusConfig: PushplusConfig
  aiConfig: AiConfig
}

export interface NotificationWebhookSettings {
  id: string
  url: string
  secret: string
  enabled: boolean
}

export interface WebhookEndpoint {
  id: string
  name: string
  url: string
  secret: string
  enabled: boolean
  eventsJson: string[]
  createdAt: string
  updatedAt: string
}

export interface ExchangeRateSnapshot {
  baseCurrency: string
  rates: Record<string, number>
  fetchedAt: string
  provider: string
  isStale: boolean
}

export interface WebhookDelivery {
  id: string
  endpointId: string
  eventType: string
  resourceKey: string
  periodKey: string
  status: 'pending' | 'success' | 'failed'
  responseCode?: number
  responseBody?: string
  attemptCount: number
  lastAttemptAt?: string
  createdAt: string
  endpoint?: {
    id: string
    name: string
    url: string
  }
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
