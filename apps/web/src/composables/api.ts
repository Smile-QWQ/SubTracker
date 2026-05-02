import axios from 'axios'
import type {
  AiRecognitionResult,
  AiTestResponse,
  AuthResponse,
  AuthUserResponse,
  BatchActionResult,
  CalendarEvent,
  BudgetStatistics,
  ChangeCredentialsPayload,
  EmailProvider,
  ExchangeRateSnapshot,
  GotifyConfig,
  LoginOptions,
  LoginPayload,
  LogoSearchResult,
  NotificationWebhookSettings,
  PaymentRecord,
  ResendConfig,
  ServerchanConfig,
  Settings,
  StatisticsOverview,
  SubtrackerBackupCommitResult,
  SubtrackerBackupInspectResult,
  Subscription,
  SubscriptionDetail,
  SubscriptionStatus,
  Tag,
  TelegramConfig,
  WallosImportCommitResult,
  WallosImportInspectResult
} from '@/types/api'
import { clearAuthSession, getStoredToken } from '@/utils/auth-storage'
import { getApiBaseUrl } from '@/utils/api-base'

const client = axios.create({
  baseURL: getApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  timeout: 30000
})

const LOGO_REQUEST_TIMEOUT_MS = 60000

client.interceptors.request.use((request) => {
  const token = getStoredToken()
  if (token) {
    request.headers.Authorization = `Bearer ${token}`
  }
  return request
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthSession()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }

    const errorPayload = error?.response?.data?.error
    const fieldErrors = errorPayload?.details?.fieldErrors as Record<string, string[] | undefined> | undefined
    const firstFieldError = fieldErrors
      ? Object.values(fieldErrors).flatMap((messages) => messages ?? []).find(Boolean)
      : null
    const message = firstFieldError || errorPayload?.message
    return Promise.reject(new Error(message || error.message || '请求失败'))
  }
)

type Envelope<T> = { data: T }

function unwrap<T>(res: { data: Envelope<T> }): T {
  return res.data.data
}

const inflightMutationRequests = new Map<string, Promise<unknown>>()

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`
}

function withMutationSingleFlight<T>(method: string, url: string, payload: unknown, request: () => Promise<T>) {
  const key = `${method}:${url}:${stableSerialize(payload)}`
  const existing = inflightMutationRequests.get(key) as Promise<T> | undefined
  if (existing) {
    return existing
  }

  const inflight = request().finally(() => {
    inflightMutationRequests.delete(key)
  })

  inflightMutationRequests.set(key, inflight)
  return inflight
}

function postOnce<T>(url: string, payload?: unknown, config?: Parameters<typeof client.post>[2]) {
  return withMutationSingleFlight('POST', url, payload, async () =>
    unwrap<T>((await client.post(url, payload, config)) as { data: Envelope<T> })
  )
}

function patchOnce<T>(url: string, payload?: unknown, config?: Parameters<typeof client.patch>[2]) {
  return withMutationSingleFlight('PATCH', url, payload, async () =>
    unwrap<T>((await client.patch(url, payload, config)) as { data: Envelope<T> })
  )
}

function putOnce<T>(url: string, payload?: unknown, config?: Parameters<typeof client.put>[2]) {
  return withMutationSingleFlight('PUT', url, payload, async () =>
    unwrap<T>((await client.put(url, payload, config)) as { data: Envelope<T> })
  )
}

function deleteOnce<T>(url: string, config?: Parameters<typeof client.delete>[1]) {
  return withMutationSingleFlight('DELETE', url, undefined, async () =>
    unwrap<T>((await client.delete(url, config)) as { data: Envelope<T> })
  )
}

export const api = {
  async login(username: string, password: string, rememberMe = false, rememberDays?: number) {
    return postOnce<AuthResponse>('/auth/login', {
      username,
      password,
      rememberMe,
      rememberDays
    } satisfies LoginPayload)
  },

  async getLoginOptions() {
    return unwrap<LoginOptions>((await client.get('/auth/login-options')) as { data: Envelope<LoginOptions> })
  },

  async getCurrentUser() {
    return unwrap<AuthUserResponse>((await client.get('/auth/me')) as { data: Envelope<AuthUserResponse> })
  },

  async changeCredentials(payload: ChangeCredentialsPayload) {
    return postOnce<AuthResponse>('/auth/change-credentials', payload)
  },

  async changeDefaultPassword(newPassword: string) {
    return postOnce<AuthResponse>('/auth/change-default-password', { newPassword })
  },

  async getSubscriptions(params?: { q?: string; status?: string; tagIds?: string }) {
    return unwrap<Subscription[]>((await client.get('/subscriptions', { params })) as { data: Envelope<Subscription[]> })
  },

  async getSubscription(id: string) {
    return unwrap<SubscriptionDetail>((await client.get(`/subscriptions/${id}`)) as { data: Envelope<SubscriptionDetail> })
  },

  async getSubscriptionPaymentRecords(id: string) {
    return unwrap<PaymentRecord[]>((await client.get(`/subscriptions/${id}/payment-records`)) as {
      data: Envelope<PaymentRecord[]>
    })
  },

  async createSubscription(payload: Record<string, unknown>) {
    return postOnce<Subscription>('/subscriptions', payload)
  },

  async searchSubscriptionLogos(payload: { name: string; websiteUrl?: string; tagName?: string }) {
    return postOnce<LogoSearchResult[]>('/subscriptions/logo/search', payload, { timeout: LOGO_REQUEST_TIMEOUT_MS })
  },

  async getSubscriptionLogoLibrary() {
    return unwrap<LogoSearchResult[]>((await client.get('/subscriptions/logo/library')) as {
      data: Envelope<LogoSearchResult[]>
    })
  },

  async deleteSubscriptionLogoFromLibrary(filename: string) {
    return deleteOnce<{ filename: string; logoUrl: string; deleted: boolean }>(`/subscriptions/logo/library/${encodeURIComponent(filename)}`)
  },

  async uploadSubscriptionLogo(payload: { filename: string; contentType: string; base64: string }) {
    return postOnce<{ logoUrl: string; logoSource: string }>('/subscriptions/logo/upload', payload)
  },

  async importSubscriptionLogo(payload: { logoUrl: string; source?: string }) {
    return postOnce<{ logoUrl: string; logoSource: string }>('/subscriptions/logo/import', payload, { timeout: LOGO_REQUEST_TIMEOUT_MS })
  },

  async updateSubscription(id: string, payload: Record<string, unknown>) {
    return patchOnce<Subscription>(`/subscriptions/${id}`, payload)
  },

  async reorderSubscriptions(ids: string[]) {
    return postOnce<{ success: boolean }>('/subscriptions/reorder', { ids })
  },

  async renewSubscription(id: string, payload: Record<string, unknown> = {}) {
    return postOnce<{ subscription: Subscription }>(`/subscriptions/${id}/renew`, payload)
  },

  async batchRenewSubscriptions(ids: string[]) {
    return postOnce<BatchActionResult>('/subscriptions/batch/renew', { ids })
  },

  async pauseSubscription(id: string) {
    return postOnce<Subscription>(`/subscriptions/${id}/pause`)
  },

  async batchPauseSubscriptions(ids: string[]) {
    return postOnce<BatchActionResult>('/subscriptions/batch/pause', { ids })
  },

  async batchUpdateSubscriptionStatus(ids: string[], status: Extract<SubscriptionStatus, 'active' | 'paused' | 'cancelled'>) {
    return postOnce<BatchActionResult>('/subscriptions/batch/status', { ids, status })
  },

  async cancelSubscription(id: string) {
    return postOnce<Subscription>(`/subscriptions/${id}/cancel`)
  },

  async batchCancelSubscriptions(ids: string[]) {
    return postOnce<BatchActionResult>('/subscriptions/batch/cancel', { ids })
  },

  async deleteSubscription(id: string) {
    return deleteOnce<{ id: string; deleted: boolean }>(`/subscriptions/${id}`)
  },

  async batchDeleteSubscriptions(ids: string[]) {
    return postOnce<BatchActionResult>('/subscriptions/batch/delete', { ids })
  },

  async recognizeSubscriptionByAi(payload: {
    text?: string
    imageBase64?: string
    filename?: string
    mimeType?: string
  }) {
    return postOnce<AiRecognitionResult>('/ai/recognize-subscription', payload)
  },

  async testAiConfiguration() {
    return postOnce<AiTestResponse>('/ai/test')
  },

  async testAiConfigurationWithPayload(payload: Settings['aiConfig']) {
    return postOnce<AiTestResponse>('/ai/test', payload)
  },

  async testAiVisionConfigurationWithPayload(payload: Settings['aiConfig']) {
    return postOnce<AiTestResponse>('/ai/test-vision', payload)
  },

  async getTags() {
    return unwrap<Tag[]>((await client.get('/tags')) as { data: Envelope<Tag[]> })
  },

  async createTag(payload: Record<string, unknown>) {
    return postOnce<Tag>('/tags', payload)
  },

  async updateTag(id: string, payload: Record<string, unknown>) {
    return patchOnce<Tag>(`/tags/${id}`, payload)
  },

  async deleteTag(id: string) {
    return deleteOnce<{ id: string; deleted: boolean }>(`/tags/${id}`)
  },

  async getStatisticsOverview() {
    return unwrap<StatisticsOverview>((await client.get('/statistics/overview')) as { data: Envelope<StatisticsOverview> })
  },

  async getBudgetStatistics() {
    return unwrap<BudgetStatistics>((await client.get('/statistics/budgets')) as { data: Envelope<BudgetStatistics> })
  },

  async getCalendarEvents(params?: { start?: string; end?: string }) {
    return unwrap<CalendarEvent[]>((await client.get('/calendar/events', { params })) as { data: Envelope<CalendarEvent[]> })
  },

  async getSettings() {
    return withMutationSingleFlight('GET', '/settings', undefined, async () =>
      unwrap<Settings>((await client.get('/settings')) as { data: Envelope<Settings> })
    )
  },

  async updateSettings(payload: Partial<Settings>) {
    return patchOnce<Settings>('/settings', payload)
  },

  async getExchangeRateSnapshot() {
    return unwrap<ExchangeRateSnapshot>((await client.get('/exchange-rates/latest')) as { data: Envelope<ExchangeRateSnapshot> })
  },

  async refreshExchangeRates() {
    return postOnce<ExchangeRateSnapshot>('/exchange-rates/refresh')
  },

  async testEmailNotification() {
    return postOnce<{ success: boolean }>('/notifications/test/email')
  },

  async testEmailNotificationWithPayload(payload: {
    emailProvider: EmailProvider
    smtpConfig: Settings['smtpConfig']
    resendConfig: ResendConfig
  }) {
    return postOnce<{ success: boolean }>('/notifications/test/email', payload)
  },

  async testPushplusNotification() {
    return postOnce<{ accepted: boolean; code?: number; message?: string; shortCode?: string }>('/notifications/test/pushplus')
  },

  async testPushplusNotificationWithPayload(payload: Settings['pushplusConfig']) {
    return postOnce<{ accepted: boolean; code?: number; message?: string; shortCode?: string }>('/notifications/test/pushplus', payload)
  },

  async testTelegramNotificationWithPayload(payload: TelegramConfig) {
    return postOnce<{ success: boolean }>('/notifications/test/telegram', payload)
  },

  async testServerchanNotificationWithPayload(payload: ServerchanConfig) {
    return postOnce<{ success: boolean }>('/notifications/test/serverchan', payload)
  },

  async testGotifyNotificationWithPayload(payload: GotifyConfig) {
    return postOnce<{ success: boolean }>('/notifications/test/gotify', payload)
  },

  async getNotificationWebhook() {
    return unwrap<NotificationWebhookSettings>((await client.get('/notifications/webhook')) as {
      data: Envelope<NotificationWebhookSettings>
    })
  },

  async updateNotificationWebhook(payload: NotificationWebhookSettings) {
    return putOnce<NotificationWebhookSettings>('/notifications/webhook', payload)
  },

  async testWebhookNotification() {
    return postOnce<{ success: boolean; statusCode: number; responseBody: string }>('/notifications/test/webhook')
  },

  async testWebhookNotificationWithPayload(payload: NotificationWebhookSettings) {
    return postOnce<{ success: boolean; statusCode: number; responseBody: string }>('/notifications/test/webhook', payload)
  },

  async exportBackup() {
    const response = await client.get('/settings/export/backup', {
      responseType: 'blob'
    })
    return {
      blob: response.data as Blob,
      filename:
        String(response.headers['content-disposition'] ?? '')
          .match(/filename="?([^"]+)"?/)?.[1]
          ?.trim() || 'subtracker-backup.zip'
    }
  },

  async inspectWallosImport(payload: { filename: string; contentType: string; base64: string; sourceTimezone?: string }) {
    return postOnce<WallosImportInspectResult>('/import/wallos/inspect', payload, { timeout: 60000 })
  },

  async commitWallosImport(importToken: string) {
    return postOnce<WallosImportCommitResult>('/import/wallos/commit', { importToken })
  },

  async inspectSubtrackerBackup(payload: { filename: string; contentType: string; base64: string }) {
    return postOnce<SubtrackerBackupInspectResult>('/import/subtracker/inspect', payload, { timeout: 60000 })
  },

  async commitSubtrackerBackup(payload: { importToken: string; mode: 'replace' | 'append'; restoreSettings: boolean }) {
    return postOnce<SubtrackerBackupCommitResult>('/import/subtracker/commit', payload, { timeout: 60000 })
  }
}
