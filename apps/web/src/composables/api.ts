import axios from 'axios'
import type {
  AiRecognitionResult,
  AuthResponse,
  AuthUserResponse,
  CalendarEvent,
  ChangeCredentialsPayload,
  ExchangeRateSnapshot,
  LoginPayload,
  LogoSearchResult,
  NotificationWebhookSettings,
  PaymentRecord,
  Settings,
  StatisticsOverview,
  Subscription,
  SubscriptionDetail,
  Tag,
  WallosImportCommitResult,
  WallosImportInspectResult,
  WebhookEndpoint
} from '@/types/api'
import { clearAuthSession, getStoredToken } from '@/utils/auth-storage'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
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

    const message = error?.response?.data?.error?.message
    return Promise.reject(new Error(message || error.message || '请求失败'))
  }
)

type Envelope<T> = { data: T }

function unwrap<T>(res: { data: Envelope<T> }): T {
  return res.data.data
}

export const api = {
  async login(username: string, password: string) {
    return unwrap<AuthResponse>((await client.post('/auth/login', { username, password } satisfies LoginPayload)) as {
      data: Envelope<AuthResponse>
    })
  },

  async getCurrentUser() {
    return unwrap<AuthUserResponse>((await client.get('/auth/me')) as { data: Envelope<AuthUserResponse> })
  },

  async changeCredentials(payload: ChangeCredentialsPayload) {
    return unwrap<AuthResponse>((await client.post('/auth/change-credentials', payload)) as {
      data: Envelope<AuthResponse>
    })
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
    return unwrap<Subscription>((await client.post('/subscriptions', payload)) as { data: Envelope<Subscription> })
  },

  async searchSubscriptionLogos(payload: { name: string; websiteUrl?: string; tagName?: string }) {
    return unwrap<LogoSearchResult[]>((await client.post('/subscriptions/logo/search', payload, { timeout: LOGO_REQUEST_TIMEOUT_MS })) as {
      data: Envelope<LogoSearchResult[]>
    })
  },

  async getSubscriptionLogoLibrary() {
    return unwrap<LogoSearchResult[]>((await client.get('/subscriptions/logo/library')) as {
      data: Envelope<LogoSearchResult[]>
    })
  },

  async deleteSubscriptionLogoFromLibrary(filename: string) {
    return unwrap<{ filename: string; logoUrl: string; deleted: boolean }>(
      (await client.delete(`/subscriptions/logo/library/${encodeURIComponent(filename)}`)) as {
        data: Envelope<{ filename: string; logoUrl: string; deleted: boolean }>
      }
    )
  },

  async uploadSubscriptionLogo(payload: { filename: string; contentType: string; base64: string }) {
    return unwrap<{ logoUrl: string; logoSource: string }>((await client.post('/subscriptions/logo/upload', payload)) as {
      data: Envelope<{ logoUrl: string; logoSource: string }>
    })
  },

  async importSubscriptionLogo(payload: { logoUrl: string; source?: string }) {
    return unwrap<{ logoUrl: string; logoSource: string }>(
      (await client.post('/subscriptions/logo/import', payload, { timeout: LOGO_REQUEST_TIMEOUT_MS })) as {
      data: Envelope<{ logoUrl: string; logoSource: string }>
      }
    )
  },

  async updateSubscription(id: string, payload: Record<string, unknown>) {
    return unwrap<Subscription>((await client.patch(`/subscriptions/${id}`, payload)) as { data: Envelope<Subscription> })
  },

  async reorderSubscriptions(ids: string[]) {
    return unwrap<{ success: boolean }>((await client.post('/subscriptions/reorder', { ids })) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async renewSubscription(id: string, payload: Record<string, unknown> = {}) {
    return unwrap<{ subscription: Subscription }>(
      (await client.post(`/subscriptions/${id}/renew`, payload)) as { data: Envelope<{ subscription: Subscription }> }
    )
  },

  async pauseSubscription(id: string) {
    return unwrap<Subscription>((await client.post(`/subscriptions/${id}/pause`)) as { data: Envelope<Subscription> })
  },

  async cancelSubscription(id: string) {
    return unwrap<Subscription>((await client.post(`/subscriptions/${id}/cancel`)) as { data: Envelope<Subscription> })
  },

  async deleteSubscription(id: string) {
    return unwrap<{ id: string; deleted: boolean }>(
      (await client.delete(`/subscriptions/${id}`)) as { data: Envelope<{ id: string; deleted: boolean }> }
    )
  },

  async recognizeSubscriptionByAi(payload: {
    text?: string
    imageBase64?: string
    filename?: string
    mimeType?: string
  }) {
    return unwrap<AiRecognitionResult>((await client.post('/ai/recognize-subscription', payload)) as {
      data: Envelope<AiRecognitionResult>
    })
  },

  async testAiConfiguration() {
    return unwrap<{ success: boolean; providerName: string; model: string; response: string }>(
      (await client.post('/ai/test')) as {
        data: Envelope<{ success: boolean; providerName: string; model: string; response: string }>
      }
    )
  },

  async testAiConfigurationWithPayload(payload: Settings['aiConfig']) {
    return unwrap<{ success: boolean; providerName: string; model: string; response: string }>(
      (await client.post('/ai/test', payload)) as {
        data: Envelope<{ success: boolean; providerName: string; model: string; response: string }>
      }
    )
  },

  async getTags() {
    return unwrap<Tag[]>((await client.get('/tags')) as { data: Envelope<Tag[]> })
  },

  async createTag(payload: Record<string, unknown>) {
    return unwrap<Tag>((await client.post('/tags', payload)) as { data: Envelope<Tag> })
  },

  async updateTag(id: string, payload: Record<string, unknown>) {
    return unwrap<Tag>((await client.patch(`/tags/${id}`, payload)) as { data: Envelope<Tag> })
  },

  async deleteTag(id: string) {
    return unwrap<{ id: string; deleted: boolean }>(
      (await client.delete(`/tags/${id}`)) as { data: Envelope<{ id: string; deleted: boolean }> }
    )
  },

  async getStatisticsOverview() {
    return unwrap<StatisticsOverview>((await client.get('/statistics/overview')) as { data: Envelope<StatisticsOverview> })
  },

  async getCalendarEvents(params?: { start?: string; end?: string }) {
    return unwrap<CalendarEvent[]>((await client.get('/calendar/events', { params })) as { data: Envelope<CalendarEvent[]> })
  },

  async getSettings() {
    return unwrap<Settings>((await client.get('/settings')) as { data: Envelope<Settings> })
  },

  async updateSettings(payload: Partial<Settings>) {
    return unwrap<Settings>((await client.patch('/settings', payload)) as { data: Envelope<Settings> })
  },

  async getExchangeRateSnapshot() {
    return unwrap<ExchangeRateSnapshot>((await client.get('/exchange-rates/latest')) as { data: Envelope<ExchangeRateSnapshot> })
  },

  async refreshExchangeRates() {
    return unwrap<ExchangeRateSnapshot>((await client.post('/exchange-rates/refresh')) as { data: Envelope<ExchangeRateSnapshot> })
  },

  async testEmailNotification() {
    return unwrap<{ success: boolean }>((await client.post('/notifications/test/email')) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async testEmailNotificationWithPayload(payload: Settings['emailConfig']) {
    return unwrap<{ success: boolean }>((await client.post('/notifications/test/email', payload)) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async testPushplusNotification() {
    return unwrap<{ success: boolean }>((await client.post('/notifications/test/pushplus')) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async testPushplusNotificationWithPayload(payload: Settings['pushplusConfig']) {
    return unwrap<{ success: boolean }>((await client.post('/notifications/test/pushplus', payload)) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async getNotificationWebhook() {
    return unwrap<NotificationWebhookSettings>((await client.get('/notifications/webhook')) as {
      data: Envelope<NotificationWebhookSettings>
    })
  },

  async updateNotificationWebhook(payload: { url: string; secret: string; enabled: boolean }) {
    return unwrap<NotificationWebhookSettings>((await client.put('/notifications/webhook', payload)) as {
      data: Envelope<NotificationWebhookSettings>
    })
  },

  async testWebhookNotification() {
    return unwrap<{ success: boolean }>((await client.post('/notifications/test/webhook')) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async testWebhookNotificationWithPayload(payload: { url: string; secret: string; enabled: boolean }) {
    return unwrap<{ success: boolean }>((await client.post('/notifications/test/webhook', payload)) as {
      data: Envelope<{ success: boolean }>
    })
  },

  async getWebhookEndpoints() {
    return unwrap<WebhookEndpoint[]>((await client.get('/webhooks')) as { data: Envelope<WebhookEndpoint[]> })
  },

  async createWebhookEndpoint(payload: Record<string, unknown>) {
    return unwrap<WebhookEndpoint>((await client.post('/webhooks', payload)) as { data: Envelope<WebhookEndpoint> })
  },

  async updateWebhookEndpoint(id: string, payload: Record<string, unknown>) {
    return unwrap<WebhookEndpoint>((await client.patch(`/webhooks/${id}`, payload)) as { data: Envelope<WebhookEndpoint> })
  },

  async inspectWallosImport(payload: { filename: string; contentType: string; base64: string }) {
    return unwrap<WallosImportInspectResult>((await client.post('/import/wallos/inspect', payload, { timeout: 60000 })) as {
      data: Envelope<WallosImportInspectResult>
    })
  },

  async commitWallosImport(importToken: string) {
    return unwrap<WallosImportCommitResult>((await client.post('/import/wallos/commit', { importToken })) as {
      data: Envelope<WallosImportCommitResult>
    })
  }
}
