import http from 'node:http'
import https from 'node:https'
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
  return NotificationWebhookSettingsSchema.parse({
    ...defaultWebhookSettings(),
    ...input,
    url: input.url?.trim() ?? '',
    headers: input.headers?.trim() || 'Content-Type: application/json',
    payloadTemplate: input.payloadTemplate?.trim() || DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE
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
  const isHttps = target.protocol === 'https:'
  const transport = isHttps ? https : http

  return new Promise<{ statusCode: number; responseBody: string }>((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method: input.requestMethod,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(requestBody).toString()
        },
        ...(isHttps ? { agent: new https.Agent({ rejectUnauthorized: !input.ignoreSsl }) } : {})
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            responseBody: Buffer.concat(chunks).toString('utf8')
          })
        })
      }
    )

    req.on('error', reject)
    req.write(requestBody)
    req.end()
  })
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

async function findWebhookDeliveryByEntry(entry: Pick<NotificationDedupEntry, 'eventType' | 'resourceKey' | 'periodKey'>) {
  return prisma.webhookDelivery.findUnique({
    where: {
      eventType_resourceKey_periodKey: {
        eventType: entry.eventType,
        resourceKey: entry.resourceKey,
        periodKey: entry.periodKey
      }
    }
  })
}

async function upsertWebhookDeliveryRecord(
  entry: NotificationDedupEntry,
  payload: DeliveryPayload,
  targetUrl: string,
  requestMethod: string
) {
  const existing = await findWebhookDeliveryByEntry(entry)
  if (existing) {
    return existing
  }

  return prisma.webhookDelivery.create({
    data: {
      eventType: entry.eventType,
      resourceKey: entry.resourceKey,
      periodKey: entry.periodKey,
      subscriptionId: entry.subscriptionId,
      targetUrl,
      requestMethod,
      payloadJson: payload as Prisma.InputJsonValue,
      status: 'pending'
    }
  })
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

async function ensureWebhookDeliveryRecords(
  entries: NotificationDedupEntry[],
  payload: DeliveryPayload,
  config: Pick<NotificationWebhookSettingsInput, 'url' | 'requestMethod'>
) {
  return Promise.all(
    entries.map((entry) =>
      upsertWebhookDeliveryRecord(entry, payload, config.url, config.requestMethod)
    )
  )
}

async function updateWebhookDeliveryRecords(
  targets: Array<{ id: string }>,
  data: {
    status: 'success' | 'failed'
    responseCode: number
    responseBody: string
  },
  payload: DeliveryPayload,
  config: Pick<NotificationWebhookSettingsInput, 'url' | 'requestMethod'>
) {
  await Promise.all(
    targets.map((target) =>
      prisma.webhookDelivery.update({
        where: { id: target.id },
        data: {
          status: data.status,
          responseCode: data.responseCode,
          responseBody: data.responseBody,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          targetUrl: config.url,
          requestMethod: config.requestMethod,
          payloadJson: payload as Prisma.InputJsonValue
        }
      })
    )
  )
}

export async function dispatchWebhookEvent(params: NotificationDispatchParams) {
  const config = normalizeWebhookSettings(await getPrimaryWebhookEndpoint())
  if (!config.enabled || !config.url) {
    return {
      channel: 'webhook' as const,
      status: 'skipped' as const,
      message: 'webhook_disabled'
    }
  }

  const pendingEntries = await resolvePendingWebhookEntries(params)
  if (pendingEntries !== null && pendingEntries.length === 0) {
    return {
      channel: 'webhook' as const,
      status: 'skipped' as const,
      message: 'webhook_already_sent'
    }
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

  const targets = await ensureWebhookDeliveryRecords(deliveryEntries, dispatchParams.payload, config)

  try {
    const result = await sendWebhookRequest(config, {
      eventType: dispatchParams.eventType,
      payload: dispatchParams.payload
    })

    await updateWebhookDeliveryRecords(
      targets,
      {
        status: result.statusCode >= 400 ? 'failed' : 'success',
        responseCode: result.statusCode,
        responseBody: result.responseBody
      },
      dispatchParams.payload,
      config
    )

    const status: 'success' | 'failed' = result.statusCode >= 400 ? 'failed' : 'success'

    return {
      channel: 'webhook' as const,
      status,
      message: result.statusCode >= 400 ? `webhook_http_${result.statusCode}` : undefined
    }
  } catch (error) {
    await updateWebhookDeliveryRecords(
      targets,
      {
        status: 'failed',
        responseCode: 0,
        responseBody: error instanceof Error ? error.message : 'Unknown error'
      },
      dispatchParams.payload,
      config
    )

    return {
      channel: 'webhook' as const,
      status: 'failed' as const,
      message: error instanceof Error ? error.message : 'webhook_dispatch_failed'
    }
  }
}
