import nodemailer from 'nodemailer'
import type { EmailConfigInput, PushPlusConfigInput, WebhookEventType } from '@subtracker/shared'
import { dispatchWebhookEvent } from './webhook.service'
import { getAppSettings, getSetting, setSetting } from './settings.service'

type NotificationDispatchParams = {
  eventType: WebhookEventType
  resourceKey: string
  periodKey: string
  subscriptionId?: string
  payload: Record<string, unknown>
}

type PushplusApiResponse = {
  code?: number
  msg?: string
  data?: unknown
}

export type PushplusSendResult = {
  accepted: boolean
  code: number
  message: string
  shortCode?: string
}

function buildNotificationKey(channel: 'email' | 'pushplus', params: NotificationDispatchParams) {
  return `notification:${channel}:${params.eventType}:${params.resourceKey}:${params.periodKey}`
}

async function hasNotificationBeenSent(channel: 'email' | 'pushplus', params: NotificationDispatchParams) {
  return getSetting<boolean>(buildNotificationKey(channel, params), false)
}

async function markNotificationSent(channel: 'email' | 'pushplus', params: NotificationDispatchParams) {
  await setSetting(buildNotificationKey(channel, params), true)
}

function getPhaseLabel(params: NotificationDispatchParams) {
  const phase = String(params.payload.phase ?? '')
  const daysUntilRenewal = Number(params.payload.daysUntilRenewal ?? 0)
  const daysOverdue = Number(params.payload.daysOverdue ?? 0)

  if (params.eventType === 'subscription.reminder_due') {
    return phase === 'due_today' ? '今天到期' : `还有 ${daysUntilRenewal} 天到期`
  }

  return `已过期第 ${daysOverdue} 天`
}

function buildNotificationTitle(params: NotificationDispatchParams) {
  const name = String(params.payload.name ?? '未命名订阅')
  return `${getPhaseLabel(params)}：${name}`
}

function buildNotificationBody(params: NotificationDispatchParams) {
  const lines = [
    `提醒类型：${getPhaseLabel(params)}`,
    `订阅名称：${String(params.payload.name ?? '')}`,
    `下次续订：${String(params.payload.nextRenewalDate ?? '')}`,
    `金额：${String(params.payload.amount ?? '')} ${String(params.payload.currency ?? '')}`.trim(),
    `标签：${Array.isArray(params.payload.tagNames) ? params.payload.tagNames.join('、') : ''}`,
    `网址：${String(params.payload.websiteUrl ?? '')}`,
    `备注：${String(params.payload.notes ?? '')}`
  ]

  return lines.filter((line) => !line.endsWith('：')).join('\n')
}

async function sendEmailWithConfig(params: NotificationDispatchParams, config: EmailConfigInput) {
  const { host, port, secure, username, password, from, to } = config
  if (!host || !port || !username || !password || !from || !to) {
    throw new Error('邮箱通知未启用或配置不完整')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password
    }
  })

  await transporter.sendMail({
    from,
    to,
    subject: buildNotificationTitle(params),
    text: buildNotificationBody(params)
  })
}

async function sendEmailNotification(params: NotificationDispatchParams) {
  const settings = await getAppSettings()
  if (!settings.emailNotificationsEnabled) return false

  const alreadySent = await hasNotificationBeenSent('email', params)
  if (alreadySent) return false

  await sendEmailWithConfig(params, settings.emailConfig)
  await markNotificationSent('email', params)
  return true
}

function extractPushplusShortCode(data: unknown): string | undefined {
  if (typeof data === 'string' && data.trim()) return data.trim()

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.shortCode === 'string' && record.shortCode.trim()) return record.shortCode.trim()
    if (typeof record.code === 'string' && record.code.trim()) return record.code.trim()
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const shortCode = extractPushplusShortCode(item)
      if (shortCode) return shortCode
    }
  }

  return undefined
}

async function sendPushplusWithConfig(
  params: NotificationDispatchParams,
  config: PushPlusConfigInput
): Promise<PushplusSendResult> {
  const { token, topic } = config
  if (!token) {
    throw new Error('PushPlus 通知未启用或配置不完整')
  }

  const response = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      topic: topic || undefined,
      title: buildNotificationTitle(params),
      content: `<pre>${buildNotificationBody(params)}</pre>`,
      template: 'html'
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`PushPlus 请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }

  let parsed: PushplusApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as PushplusApiResponse) : null
  } catch {
    throw new Error(`PushPlus 返回了无法解析的响应：${rawText || 'empty response'}`)
  }

  if (!parsed || parsed.code !== 200) {
    throw new Error(`PushPlus 请求被拒绝：${parsed?.msg || rawText || 'unknown error'}`)
  }

  return {
    accepted: true,
    code: parsed.code,
    message: parsed.msg || '请求已提交',
    shortCode: extractPushplusShortCode(parsed.data)
  }
}

async function sendPushplusNotification(params: NotificationDispatchParams) {
  const settings = await getAppSettings()
  if (!settings.pushplusNotificationsEnabled) return false

  const alreadySent = await hasNotificationBeenSent('pushplus', params)
  if (alreadySent) return false

  await sendPushplusWithConfig(params, settings.pushplusConfig)
  await markNotificationSent('pushplus', params)
  return true
}

export async function dispatchNotificationEvent(params: NotificationDispatchParams) {
  await dispatchWebhookEvent(params)
  await Promise.allSettled([sendEmailNotification(params), sendPushplusNotification(params)])
}

function buildTestReminderPayload() {
  return {
    name: '测试订阅',
    nextRenewalDate: new Date().toISOString(),
    amount: 19.9,
    currency: 'CNY',
    tagNames: ['测试标签'],
    websiteUrl: 'https://example.com',
    notes: '这是一条测试通知',
    phase: 'upcoming',
    daysUntilRenewal: 3,
    daysOverdue: 0
  }
}

export async function sendTestEmailNotification() {
  const success = await sendEmailNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:email',
    periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
    payload: buildTestReminderPayload()
  })

  if (!success) {
    throw new Error('邮箱通知未启用或配置不完整')
  }
}

export async function sendTestEmailNotificationWithConfig(config: EmailConfigInput) {
  await sendEmailWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:email',
      periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
      payload: buildTestReminderPayload()
    },
    config
  )
}

export async function sendTestPushplusNotification() {
  const success = await sendPushplusNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:pushplus',
    periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
    payload: buildTestReminderPayload()
  })

  if (!success) {
    throw new Error('PushPlus 通知未启用或配置不完整')
  }

  return {
    accepted: true,
    message: 'PushPlus 使用已保存配置提交了测试请求'
  }
}

export async function sendTestPushplusNotificationWithConfig(config: PushPlusConfigInput) {
  return sendPushplusWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:pushplus',
      periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
      payload: buildTestReminderPayload()
    },
    config
  )
}
