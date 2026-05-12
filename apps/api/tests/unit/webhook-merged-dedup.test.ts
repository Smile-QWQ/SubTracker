import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type NotificationDedupEntry, type NotificationDispatchParams } from '../../src/services/notification-merge.service'

const webhookState = vi.hoisted(() => {
  const deliveries = new Map<
    string,
    {
      id: string
      eventType: string
      resourceKey: string
      periodKey: string
      status: 'pending' | 'success' | 'failed'
      payloadJson?: unknown
    }
  >()
  let idCounter = 0

  const dedupEntries: NotificationDedupEntry[] = [
    {
      eventType: 'subscription.reminder_due' as const,
      resourceKey: 'subscription:sub-1',
      periodKey: '2026-05-01:due_today:advance-0@09:30',
      subscriptionId: 'sub-1',
      phase: 'due_today',
      payload: {
        id: 'sub-1',
        name: 'Netflix',
        notifyDaysBefore: 0,
        amount: 10,
        currency: 'USD',
        nextRenewalDate: '2026-05-01',
        tagNames: ['视频'],
        websiteUrl: 'https://netflix.com',
        notes: '',
        status: 'active',
        phase: 'due_today',
        daysUntilRenewal: 0,
        daysOverdue: 0,
        reminderRuleTime: '09:30',
        reminderRuleDays: 0
      }
    },
    {
      eventType: 'subscription.overdue' as const,
      resourceKey: 'subscription:sub-2',
      periodKey: '2026-04-30:overdue_day_1:overdue-1@09:30',
      subscriptionId: 'sub-2',
      phase: 'overdue_day_1',
      payload: {
        id: 'sub-2',
        name: 'Spotify',
        notifyDaysBefore: 0,
        amount: 20,
        currency: 'USD',
        nextRenewalDate: '2026-04-30',
        tagNames: ['音乐'],
        websiteUrl: 'https://spotify.com',
        notes: '',
        status: 'expired',
        phase: 'overdue',
        daysUntilRenewal: 0,
        daysOverdue: 1,
        reminderRuleTime: '09:30',
        reminderRuleDays: 1
      }
    },
    {
      eventType: 'subscription.reminder_due' as const,
      resourceKey: 'subscription:sub-3',
      periodKey: '2026-05-01:due_today:advance-0@09:30',
      subscriptionId: 'sub-3',
      phase: 'due_today',
      payload: {
        id: 'sub-3',
        name: 'Notion',
        notifyDaysBefore: 0,
        amount: 30,
        currency: 'USD',
        nextRenewalDate: '2026-05-01',
        tagNames: ['办公'],
        websiteUrl: 'https://notion.so',
        notes: '',
        status: 'active',
        phase: 'due_today',
        daysUntilRenewal: 0,
        daysOverdue: 0,
        reminderRuleTime: '09:30',
        reminderRuleDays: 0
      }
    }
  ]

  const makeKey = (eventType: string, resourceKey: string, periodKey: string) => `${eventType}|${resourceKey}|${periodKey}`

  return {
    getSettingMock: vi.fn(),
    setSettingMock: vi.fn(),
    httpsRequestMock: vi.fn(),
    webhookFindUniqueMock: vi.fn(async ({ where }: { where: { eventType_resourceKey_periodKey: { eventType: string; resourceKey: string; periodKey: string } } }) => {
      const lookup = where.eventType_resourceKey_periodKey
      return deliveries.get(makeKey(lookup.eventType, lookup.resourceKey, lookup.periodKey)) ?? null
    }),
    webhookCreateMock: vi.fn(async ({ data }: { data: { eventType: string; resourceKey: string; periodKey: string; payloadJson: unknown } }) => {
      const id = `delivery-${++idCounter}`
      const record = {
        id,
        eventType: data.eventType,
        resourceKey: data.resourceKey,
        periodKey: data.periodKey,
        status: 'pending' as const,
        payloadJson: data.payloadJson
      }
      deliveries.set(makeKey(data.eventType, data.resourceKey, data.periodKey), record)
      return record
    }),
    webhookUpdateMock: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const target = Array.from(deliveries.values()).find((record) => record.id === where.id)
      if (!target) {
        throw new Error(`Missing delivery ${where.id}`)
      }
      Object.assign(target, data)
      return target
    }),
    reset() {
      deliveries.clear()
      idCounter = 0
    },
    seedSuccess(entry: (typeof dedupEntries)[number]) {
      const key = makeKey(entry.eventType, entry.resourceKey, entry.periodKey)
      deliveries.set(key, {
        id: `delivery-${++idCounter}`,
        eventType: entry.eventType,
        resourceKey: entry.resourceKey,
        periodKey: entry.periodKey,
        status: 'success',
        payloadJson: entry.payload
      })
    },
    listDeliveries() {
      return Array.from(deliveries.values())
    },
    dedupEntries
  }
})

vi.mock('node:https', () => {
  class MockAgent {}
  return {
    default: {
      Agent: MockAgent,
      request: webhookState.httpsRequestMock
    },
    Agent: MockAgent,
    request: webhookState.httpsRequestMock
  }
})

vi.mock('../../src/services/settings.service', () => ({
  getSetting: webhookState.getSettingMock,
  setSetting: webhookState.setSettingMock
}))

vi.mock('../../src/db', () => ({
  prisma: {
    webhookDelivery: {
      findUnique: webhookState.webhookFindUniqueMock,
      create: webhookState.webhookCreateMock,
      update: webhookState.webhookUpdateMock
    }
  }
}))

const baseWebhookParams: NotificationDispatchParams = {
  eventType: 'subscription.overdue' as const,
  resourceKey: 'subscriptions:scan-summary',
  periodKey:
    '2026-05-01:summary:2026-04-30:overdue_day_1:overdue-1@09:30|2026-05-01:due_today:advance-0@09:30|2026-05-01:due_today:advance-0@09:30',
  payload: {
    merged: true,
    mergedCount: 3,
    mergedSections: [
      {
        phase: 'due_today',
        title: '今天到期',
        eventType: 'subscription.reminder_due' as const,
        subscriptions: [webhookState.dedupEntries[0].payload, webhookState.dedupEntries[2].payload]
      },
      {
        phase: 'overdue_day_1',
        title: '已过期第 1 天',
        eventType: 'subscription.overdue' as const,
        subscriptions: [webhookState.dedupEntries[1].payload]
      }
    ],
    name: '共 3 项订阅',
    nextRenewalDate: '2026-05-01',
    notifyDaysBefore: 0,
    amount: 60,
    currency: 'USD',
    status: 'expired',
    tagNames: [],
    websiteUrl: '',
    notes: '',
    phase: 'summary',
    daysUntilRenewal: 0,
    daysOverdue: 1,
    subscriptions: webhookState.dedupEntries.map((entry) => entry.payload)
  },
  dedupEntries: webhookState.dedupEntries
}

describe('dispatchWebhookEvent merged dedup', () => {
  beforeEach(() => {
    vi.resetModules()
    webhookState.httpsRequestMock.mockReset()
    webhookState.getSettingMock.mockReset()
    webhookState.setSettingMock.mockReset()
    webhookState.webhookFindUniqueMock.mockClear()
    webhookState.webhookCreateMock.mockClear()
    webhookState.webhookUpdateMock.mockClear()
    webhookState.reset()
    webhookState.getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'https://example.com/hook',
      requestMethod: 'POST',
      headers: 'Content-Type: application/json',
      payloadTemplate:
        '{"phase":"{{phase}}","subscription":{"name":"{{subscription_name}}"},"daysUntilRenewal":{{days_until}},"daysOverdue":{{days_overdue}}}',
      ignoreSsl: false
    })
    webhookState.httpsRequestMock.mockImplementation(
      (_target: unknown, _options: unknown, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
        const req = new EventEmitter() as EventEmitter & { body: string; write: (chunk: string) => void; end: () => void }
        req.body = ''
        req.write = (chunk: string) => {
          req.body += chunk
        }
        req.end = () => {
          const res = new EventEmitter() as EventEmitter & { statusCode?: number }
          res.statusCode = 200
          callback(res)
          queueMicrotask(() => {
            res.emit('data', Buffer.from('ok'))
            res.emit('end')
          })
        }
        return req
      }
    )
  })

  it('skips webhook when all dedup entries were already delivered', async () => {
    for (const entry of webhookState.dedupEntries) {
      webhookState.seedSuccess(entry)
    }

    const { dispatchWebhookEvent } = await import('../../src/services/webhook.service')
    const result = await dispatchWebhookEvent(baseWebhookParams)

    expect(result).toMatchObject({
      status: 'skipped',
      message: 'webhook_already_sent'
    })
    expect(webhookState.httpsRequestMock).not.toHaveBeenCalled()
  })

  it('sends only pending webhook entries and records success per entry', async () => {
    webhookState.seedSuccess(webhookState.dedupEntries[0])
    const { dispatchWebhookEvent } = await import('../../src/services/webhook.service')
    const result = await dispatchWebhookEvent(baseWebhookParams)

    expect(result).toMatchObject({ status: 'success' })
    expect(webhookState.httpsRequestMock).toHaveBeenCalledTimes(1)
    const successRecords = webhookState.listDeliveries().filter((record) => record.status === 'success')
    expect(successRecords).toHaveLength(3)
    const pendingPayloadRecords = successRecords.filter((record) => record.resourceKey !== 'subscription:sub-1')
    for (const record of pendingPayloadRecords) {
      expect(record.payloadJson).toMatchObject({
        merged: true,
        mergedCount: 2,
        name: '共 2 项订阅'
      })
      expect(
        (record.payloadJson as { subscriptions: Array<{ name: string }> }).subscriptions.map((item) => item.name).sort()
      ).toEqual(['Notion', 'Spotify'])
    }
  })

  it('retries only failed/pending webhook entries after channel divergence', async () => {
    webhookState.seedSuccess(webhookState.dedupEntries[0])
    const { dispatchWebhookEvent } = await import('../../src/services/webhook.service')
    await dispatchWebhookEvent(baseWebhookParams)
    webhookState.httpsRequestMock.mockClear()

    const second = await dispatchWebhookEvent(baseWebhookParams)

    expect(second).toMatchObject({
      status: 'skipped',
      message: 'webhook_already_sent'
    })
    expect(webhookState.httpsRequestMock).not.toHaveBeenCalled()
  })
})
