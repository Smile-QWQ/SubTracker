import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { signWebhookPayload } from '../utils/webhook'
import type { WebhookEventType } from '@subtracker/shared'

type DeliveryPayload = Record<string, unknown>
export type PrimaryWebhookInput = {
  url: string
  secret: string
  enabled: boolean
}

const ALL_WEBHOOK_EVENTS: WebhookEventType[] = [
  'subscription.reminder_due',
  'subscription.overdue',
  'subscription.renewed',
  'exchange-rate.stale'
]

const PRIMARY_WEBHOOK_NAME = 'Default Webhook'

export async function listWebhookEndpoints() {
  return prisma.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getPrimaryWebhookEndpoint() {
  return prisma.webhookEndpoint.findFirst({
    orderBy: { createdAt: 'asc' }
  })
}

export async function listWebhookDeliveries(limit = 100) {
  return prisma.webhookDelivery.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      endpoint: {
        select: { id: true, name: true, url: true }
      }
    }
  })
}

async function postWebhook(
  endpoint: { url: string; secret: string },
  payload: {
    eventType: WebhookEventType | 'test'
    payload: DeliveryPayload
  }
) {
  const body = JSON.stringify({
    eventType: payload.eventType,
    timestamp: new Date().toISOString(),
    payload: payload.payload
  })

  const signature = signWebhookPayload(endpoint.secret, body)

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Subtracker-Signature': signature
    },
    body
  })

  return {
    response,
    responseBody: await response.text()
  }
}

export async function upsertPrimaryWebhookEndpoint(input: PrimaryWebhookInput) {
  const current = await getPrimaryWebhookEndpoint()
  const data = {
    name: PRIMARY_WEBHOOK_NAME,
    url: input.url.trim(),
    secret: input.secret.trim(),
    enabled: input.enabled,
    eventsJson: ALL_WEBHOOK_EVENTS
  }

  if (current) {
    return prisma.webhookEndpoint.update({
      where: { id: current.id },
      data
    })
  }

  return prisma.webhookEndpoint.create({
    data
  })
}

export async function sendTestWebhookNotification() {
  const endpoint = await getPrimaryWebhookEndpoint()
  if (!endpoint || !endpoint.enabled || !endpoint.url || !endpoint.secret) {
    throw new Error('Webhook 未启用或配置不完整')
  }

  return sendTestWebhookNotificationWithConfig({
    url: endpoint.url,
    secret: endpoint.secret,
    enabled: endpoint.enabled
  })
}

export async function sendTestWebhookNotificationWithConfig(input: PrimaryWebhookInput) {
  if (!input.enabled || !input.url || !input.secret) {
    throw new Error('Webhook 未启用或配置不完整')
  }

  const { response, responseBody } = await postWebhook(
    {
      url: input.url.trim(),
      secret: input.secret.trim()
    },
    {
      eventType: 'test',
      payload: {
        source: 'SubTracker',
        message: '这是一条测试通知',
        sentAt: new Date().toISOString()
      }
    }
  )

  if (!response.ok) {
    throw new Error(`Webhook 测试失败：HTTP ${response.status} ${responseBody || ''}`.trim())
  }

  return true
}

export async function dispatchWebhookEvent(params: {
  eventType: WebhookEventType
  resourceKey: string
  periodKey: string
  payload: DeliveryPayload
  subscriptionId?: string
}) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { enabled: true } })

  for (const endpoint of endpoints) {
    const events = endpoint.eventsJson as string[]
    if (!events.includes(params.eventType)) continue

    const existing = await prisma.webhookDelivery.findUnique({
      where: {
        endpointId_eventType_resourceKey_periodKey: {
          endpointId: endpoint.id,
          eventType: params.eventType,
          resourceKey: params.resourceKey,
          periodKey: params.periodKey
        }
      }
    })

    if (existing?.status === 'success') {
      continue
    }

    const target =
      existing ??
      (await prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          eventType: params.eventType,
          resourceKey: params.resourceKey,
          periodKey: params.periodKey,
          subscriptionId: params.subscriptionId,
          payloadJson: params.payload as Prisma.InputJsonValue,
          status: 'pending'
        }
      }))

    try {
      const { response, responseBody } = await postWebhook(endpoint, {
        eventType: params.eventType,
        payload: params.payload
      })

      await prisma.webhookDelivery.update({
        where: { id: target.id },
        data: {
          status: response.ok ? 'success' : 'failed',
          responseCode: response.status,
          responseBody,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date()
        }
      })
    } catch (error) {
      await prisma.webhookDelivery.update({
        where: { id: target.id },
        data: {
          status: 'failed',
          responseCode: 0,
          responseBody: error instanceof Error ? error.message : 'Unknown error',
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date()
        }
      })
    }
  }
}
