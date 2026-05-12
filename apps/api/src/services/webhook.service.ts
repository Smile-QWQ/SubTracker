import { Prisma } from '@prisma/client'
import {
  DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
  NotificationWebhookSettingsSchema,
  type NotificationWebhookSettingsInput,
  type WebhookEventType
} from '@subtracker/shared'
import { prisma } from '../db'
import { getSetting, setSetting } from './settings.service'
import { validateNotificationTargetUrl } from './notification-url.service'
import {
  buildDispatchParamsFromDedupEntries,
  type NotificationDedupEntry,
  type NotificationDispatchParams
} from './notification-merge.service'

type DeliveryPayload = Record<string, unknown>

export type PrimaryWebhookInput = NotificationWebhookSettingsInput

export type WebhookTestResult = {
  success: boolean
  statusCode: number
  responseBody: string
}

const PRIMARY_WEBHOOK_SETTINGS_KEY = 'notificationWebhook'

function defaultWebhookSettings(): NotificationWebhookSettingsInput {
  return {
    enabled: false,
    url: '',
    requestMethod: 'POST',
    headers: 'Content-Type: application/json',
    payloadTemplate: DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
    ignoreSsl: false
  }
}

function normalizeWebhookSettings(input: Partial<NotificationWebhookSettingsInput>): NotificationWebhookSettingsInput {
  // Cloudflare Worker fetch does not expose a per-request TLS verification toggle,
  // so ignoreSsl is intentionally forced off in lite/worker runtime.
  return NotificationWebhookSettingsSchema.parse({
    ...defaultWebhookSettings(),
    ...input,
    url: input.url?.trim() ?? '',
    headers: input.headers?.trim() || 'Content-Type: application/json',
    payloadTemplate: input.payloadTemplate?.trim() || DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
    ignoreSsl: false
  })
}

function parseHeaders(headersText: string) {
  const trimmed = headersText.trim()
  if (!trimmed) return { 'Content-Type': 'application/json' }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    )
  } catch {
    return Object.fromEntries(
      trimmed
        .split(/\r\n|\n|\r/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const separatorIndex = line.indexOf(':')
          if (separatorIndex === -1) return [line, '']
          return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
        })
    )
  }
}

function buildTemplateValues(params: { eventType: WebhookEventType | 'test'; payload: DeliveryPayload }) {
  const payload = params.payload
  return {
    phase: String(payload.phase ?? (params.eventType === 'subscription.overdue' ? 'overdue' : 'upcoming')),
    days_until: String(payload.daysUntilRenewal ?? 0),
    days_overdue: String(payload.daysOverdue ?? 0),
    subscription_id: String(payload.id ?? payload.subscriptionId ?? ''),
    subscription_name: String(payload.name ?? '测试订阅'),
    subscription_amount: String(payload.amount ?? 0),
    subscription_currency: String(payload.currency ?? 'CNY'),
    subscription_next_renewal_date: String(payload.nextRenewalDate ?? new Date().toISOString()),
    subscription_tags: Array.isArray(payload.tagNames) ? payload.tagNames.join(', ') : String(payload.tagNames ?? ''),
    subscription_url: String(payload.websiteUrl ?? ''),
    subscription_notes: String(payload.notes ?? '')
  }
}

function applyPayloadTemplate(template: string, params: { eventType: WebhookEventType | 'test'; payload: DeliveryPayload }) {
  const values = buildTemplateValues(params)
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template)
}

async function sendWebhookRequest(
  input: NotificationWebhookSettingsInput,
  params: { eventType: WebhookEventType | 'test'; payload: DeliveryPayload }
) {
  const target = validateNotificationTargetUrl(input.url.trim(), 'Webhook URL')
  const headers = parseHeaders(input.headers)
  const requestBody = applyPayloadTemplate(input.payloadTemplate, params)

  const response = await fetch(target.toString(), {
    method: input.requestMethod,
    headers,
    body: requestBody
  })

  const responseBody = await response.text()
  return {
    statusCode: response.status,
    responseBody
  }
}

export async function getPrimaryWebhookEndpoint() {
  return getSetting<NotificationWebhookSettingsInput>(PRIMARY_WEBHOOK_SETTINGS_KEY, defaultWebhookSettings())
}

export async function upsertPrimaryWebhookEndpoint(input: PrimaryWebhookInput) {
  const normalized = normalizeWebhookSettings(input)
  await setSetting(PRIMARY_WEBHOOK_SETTINGS_KEY, normalized)
  return normalized
}

export async function sendTestWebhookNotification() {
  const endpoint = await getPrimaryWebhookEndpoint()
  if (!endpoint.url) {
    throw new Error('Webhook 配置不完整，请先填写 URL')
  }

  return sendTestWebhookNotificationWithConfig(endpoint)
}

export async function sendTestWebhookNotificationWithConfig(input: PrimaryWebhookInput): Promise<WebhookTestResult> {
  const normalized = normalizeWebhookSettings(input)
  if (!normalized.url) {
    throw new Error('Webhook 配置不完整，请先填写 URL')
  }

  const result = await sendWebhookRequest(normalized, {
    eventType: 'test',
    payload: {
      id: 'test-subscription',
      name: '测试订阅',
      amount: 10,
      currency: 'USD',
      nextRenewalDate: new Date().toISOString(),
      tagNames: ['测试标签'],
      websiteUrl: 'https://example.com/test-subscription',
      notes: '这是一条测试通知',
      phase: 'upcoming',
      daysUntilRenewal: 5,
      daysOverdue: 0
    }
  })

  if (result.statusCode >= 400) {
    throw new Error(`Webhook 测试失败：HTTP ${result.statusCode} ${result.responseBody || ''}`.trim())
  }

  return {
    success: true,
    statusCode: result.statusCode,
    responseBody: result.responseBody
  }
}

export async function dispatchWebhookEvent(params: {
  eventType: WebhookEventType
  resourceKey: string
  periodKey: string
  subscriptionId?: string
  payload: DeliveryPayload
  dedupEntries?: NotificationDedupEntry[]
}) {
  const endpoint = await getPrimaryWebhookEndpoint()
  if (!endpoint.enabled || !endpoint.url.trim()) {
    return {
      channel: 'webhook',
      status: 'skipped',
      reason: 'webhook_disabled'
    } as const
  }

  async function findWebhookDeliveryByEntry(entry: Pick<NotificationDispatchParams, 'eventType' | 'resourceKey' | 'periodKey'>) {
    return prisma.webhookDelivery.findUnique({
      where: {
        eventType_resourceKey_periodKey: {
          eventType: entry.eventType,
          resourceKey: entry.resourceKey,
          periodKey: entry.periodKey
        }
      },
      select: {
        id: true,
        attemptCount: true,
        status: true
      }
    })
  }

  async function ensureWebhookDeliveryRecords(
    entries: NotificationDedupEntry[],
    payload: DeliveryPayload,
    config: NotificationWebhookSettingsInput
  ) {
    const targets: Array<{
      id?: string
      attemptCount: number
      eventType: WebhookEventType
      resourceKey: string
      periodKey: string
      subscriptionId?: string
    }> = []

    for (const entry of entries) {
      const existing = await findWebhookDeliveryByEntry(entry)
      if (existing) {
        targets.push({
          id: existing.id,
          attemptCount: existing.attemptCount,
          eventType: entry.eventType,
          resourceKey: entry.resourceKey,
          periodKey: entry.periodKey,
          subscriptionId: entry.subscriptionId
        })
        continue
      }

      await prisma.webhookDelivery.create({
        data: {
          subscriptionId: entry.subscriptionId ?? null,
          eventType: entry.eventType,
          resourceKey: entry.resourceKey,
          periodKey: entry.periodKey,
          targetUrl: config.url,
          requestMethod: config.requestMethod,
          payloadJson: payload as Prisma.InputJsonValue,
          status: 'pending'
        }
      })

      const created = await findWebhookDeliveryByEntry(entry)
      targets.push({
        id: created?.id,
        attemptCount: created?.attemptCount ?? 0,
        eventType: entry.eventType,
        resourceKey: entry.resourceKey,
        periodKey: entry.periodKey,
        subscriptionId: entry.subscriptionId
      })
    }

    return targets
  }

  async function resolvePendingWebhookEntries(params: NotificationDispatchParams) {
    const dedupEntries = params.dedupEntries
    if (!dedupEntries?.length) {
      const existing = await findWebhookDeliveryByEntry(params)
      return existing?.status === 'success' ? [] : null
    }

    const pending: NotificationDedupEntry[] = []
    for (const entry of dedupEntries) {
      const existing = await findWebhookDeliveryByEntry(entry)
      if (existing?.status !== 'success') {
        pending.push(entry)
      }
    }

    return pending
  }

  const pendingEntries = await resolvePendingWebhookEntries(params)
  if (pendingEntries?.length === 0) {
    return {
      channel: 'webhook',
      status: 'skipped',
      message: 'webhook_already_sent'
    } as const
  }

  const dispatchParams =
    pendingEntries === null
      ? params
      : buildDispatchParamsFromDedupEntries(pendingEntries, {
          resourceKey: params.resourceKey,
          periodKey: params.periodKey
        })

  const deliveryEntries = dispatchParams.dedupEntries?.length
    ? dispatchParams.dedupEntries
    : [
        {
          eventType: dispatchParams.eventType,
          resourceKey: dispatchParams.resourceKey,
          periodKey: dispatchParams.periodKey,
          subscriptionId: dispatchParams.subscriptionId,
          phase: String(dispatchParams.payload.phase ?? ''),
          payload: dispatchParams.payload as NotificationDedupEntry['payload']
        }
      ]

  const targets = await ensureWebhookDeliveryRecords(deliveryEntries, dispatchParams.payload, endpoint)

  try {
    const result = await sendWebhookRequest(endpoint, {
      eventType: dispatchParams.eventType,
      payload: dispatchParams.payload
    })

    const nextStatus = result.statusCode >= 400 ? 'failed' : 'success'

    for (const target of targets) {
      if (!target.id) continue
      await prisma.webhookDelivery.update({
        where: { id: target.id },
        data: {
          subscriptionId: target.subscriptionId ?? null,
          targetUrl: endpoint.url,
          requestMethod: endpoint.requestMethod,
          payloadJson: dispatchParams.payload as Prisma.InputJsonValue,
          status: nextStatus,
          responseCode: result.statusCode,
          responseBody: result.responseBody,
          attemptCount: target.attemptCount + 1,
          lastAttemptAt: new Date()
        }
      })
    }

    if (result.statusCode >= 400) {
      throw new Error(`Webhook dispatch failed: HTTP ${result.statusCode}`)
    }

    return {
      channel: 'webhook',
      status: 'success'
    } as const
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Webhook dispatch failed: HTTP ')) {
      throw error
    }

    for (const target of targets) {
      if (!target.id) continue
      await prisma.webhookDelivery.update({
        where: { id: target.id },
        data: {
          subscriptionId: target.subscriptionId ?? null,
          targetUrl: endpoint.url,
          requestMethod: endpoint.requestMethod,
          payloadJson: dispatchParams.payload as Prisma.InputJsonValue,
          status: 'failed',
          responseCode: 0,
          responseBody: error instanceof Error ? error.message : 'webhook_dispatch_failed',
          attemptCount: target.attemptCount + 1,
          lastAttemptAt: new Date()
        }
      })
    }

    throw error
  }
}
