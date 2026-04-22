import dayjs from 'dayjs'
import type { EmailConfigInput, PushPlusConfigInput, TelegramConfigInput, WebhookEventType } from '@subtracker/shared'
import { config } from '../config'
import { getWorkerCache } from '../runtime'
import { dispatchWebhookEvent } from './webhook.service'
import { getNotificationChannelSettings, getSetting, setSetting } from './settings.service'

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

type TelegramApiResponse = {
  ok?: boolean
  description?: string
}

type NotificationSubscriptionItem = {
  id: string
  name: string
  nextRenewalDate: string
  amount: number
  currency: string
  tagNames?: string[]
  websiteUrl?: string
  notes?: string
  daysUntilRenewal?: number
  daysOverdue?: number
}

type NotificationSummarySection = {
  phase: string
  title: string
  eventType: WebhookEventType
  subscriptions: NotificationSubscriptionItem[]
}

export type PushplusSendResult = {
  accepted: boolean
  code: number
  message: string
  shortCode?: string
}

export type NotificationChannelResult = {
  channel: 'webhook' | 'email' | 'pushplus' | 'telegram'
  status: 'success' | 'skipped' | 'failed'
  message?: string
}

function buildNotificationKey(
  channel: 'email' | 'pushplus' | 'telegram',
  params: NotificationDispatchParams
) {
  return `notification:${channel}:${params.eventType}:${params.resourceKey}:${params.periodKey}`
}

async function hasNotificationBeenSent(
  channel: 'email' | 'pushplus' | 'telegram',
  params: NotificationDispatchParams
) {
  const key = buildNotificationKey(channel, params)
  const cache = getWorkerCache()
  if (cache) {
    return Boolean(await cache.get(key))
  }

  return getSetting<boolean>(key, false)
}

async function markNotificationSent(
  channel: 'email' | 'pushplus' | 'telegram',
  params: NotificationDispatchParams
) {
  const key = buildNotificationKey(channel, params)
  const cache = getWorkerCache()
  if (cache) {
    await cache.put(key, '1', {
      expirationTtl: 60 * 60 * 24 * 14
    })
    return
  }

  await setSetting(key, true)
}

function getMergedSubscriptions(params: NotificationDispatchParams) {
  const subscriptions = params.payload.subscriptions
  return Array.isArray(subscriptions) ? (subscriptions as NotificationSubscriptionItem[]) : []
}

function getMergedSections(params: NotificationDispatchParams) {
  const sections = params.payload.mergedSections
  return Array.isArray(sections) ? (sections as NotificationSummarySection[]) : []
}

export function formatNotificationDate(value: string | undefined) {
  if (!value) return ''
  const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})T/)
  if (isoDateMatch) {
    return isoDateMatch[1]
  }
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : value
}

function getPhaseLabel(params: NotificationDispatchParams) {
  const phase = String(params.payload.phase ?? '')
  const daysUntilRenewal = Number(params.payload.daysUntilRenewal ?? 0)
  const daysOverdue = Number(params.payload.daysOverdue ?? 0)
  const mergedSections = getMergedSections(params)
  const mergedSubscriptions = getMergedSubscriptions(params)

  if (mergedSections.length > 1) {
    return '订阅提醒汇总'
  }

  if (params.eventType === 'subscription.reminder_due') {
    if (mergedSubscriptions.length > 0) {
      return phase === 'due_today' ? '今天到期' : '即将到期'
    }
    return phase === 'due_today' ? '今天到期' : `还有 ${daysUntilRenewal} 天到期`
  }

  return mergedSubscriptions.length > 0 ? '过期提醒' : `已过期第 ${daysOverdue} 天`
}

function buildNotificationTitle(params: NotificationDispatchParams) {
  const mergedSubscriptions = getMergedSubscriptions(params)
  const mergedSections = getMergedSections(params)

  if (mergedSubscriptions.length > 0) {
    const prefix = mergedSections.length > 1 ? '订阅提醒汇总' : getPhaseLabel(params)
    return `${prefix}：共 ${mergedSubscriptions.length} 项订阅`
  }

  const name = String(params.payload.name ?? '未命名订阅')
  return `${getPhaseLabel(params)}：${name}`
}

function buildSummarySectionBody(section: NotificationSummarySection) {
  return [
    `${section.title}（${section.subscriptions.length} 项）`,
    ...section.subscriptions.map((subscription, index) => {
      const amountText = `${subscription.amount} ${subscription.currency}`.trim()
      const extras = [
        subscription.daysUntilRenewal !== undefined && subscription.daysUntilRenewal > 0
          ? `还有 ${subscription.daysUntilRenewal} 天`
          : null,
        subscription.daysOverdue !== undefined && subscription.daysOverdue > 0
          ? `过期 ${subscription.daysOverdue} 天`
          : null
      ]
        .filter(Boolean)
        .join(' / ')

      return [
        `${index + 1}. ${subscription.name}`,
        `   日期：${formatNotificationDate(subscription.nextRenewalDate)}`,
        `   金额：${amountText}`,
        extras ? `   说明：${extras}` : null
      ]
        .filter(Boolean)
        .join('\n')
    })
  ].join('\n')
}

function buildMergedNotificationBody(params: NotificationDispatchParams) {
  const mergedSections = getMergedSections(params)
  const mergedSubscriptions = getMergedSubscriptions(params)

  if (mergedSections.length > 0) {
    const lines = [
      `提醒类型：${getPhaseLabel(params)}`,
      `订阅数量：${mergedSubscriptions.length} 项`,
      ''
    ]

    for (const section of mergedSections) {
      lines.push(buildSummarySectionBody(section), '')
    }

    return lines.join('\n').trim()
  }

  return [
    `提醒类型：${getPhaseLabel(params)}`,
    `订阅数量：${mergedSubscriptions.length} 项`,
    '',
    ...mergedSubscriptions.map((subscription, index) => {
      const amountText = `${subscription.amount} ${subscription.currency}`.trim()
      const extras = [
        subscription.daysUntilRenewal !== undefined && subscription.daysUntilRenewal > 0
          ? `还有 ${subscription.daysUntilRenewal} 天`
          : null,
        subscription.daysOverdue !== undefined && subscription.daysOverdue > 0
          ? `过期 ${subscription.daysOverdue} 天`
          : null
      ]
        .filter(Boolean)
        .join(' / ')

      return [
        `${index + 1}. ${subscription.name}`,
        `   日期：${formatNotificationDate(subscription.nextRenewalDate)}`,
        `   金额：${amountText}`,
        extras ? `   说明：${extras}` : null
      ]
        .filter(Boolean)
        .join('\n')
    })
  ].join('\n')
}

function buildNotificationBody(params: NotificationDispatchParams) {
  const mergedSubscriptions = getMergedSubscriptions(params)
  if (mergedSubscriptions.length > 0) {
    return buildMergedNotificationBody(params)
  }

  const lines = [
    `提醒类型：${getPhaseLabel(params)}`,
    `订阅名称：${String(params.payload.name ?? '')}`,
    `下次续订：${formatNotificationDate(String(params.payload.nextRenewalDate ?? ''))}`,
    `金额：${`${String(params.payload.amount ?? '')} ${String(params.payload.currency ?? '')}`.trim()}`,
    `标签：${Array.isArray(params.payload.tagNames) ? params.payload.tagNames.join('、') : ''}`,
    `网址：${String(params.payload.websiteUrl ?? '')}`,
    `备注：${String(params.payload.notes ?? '')}`
  ]

  return lines.filter((line) => !line.endsWith('：')).join('\n')
}

async function sendEmailWithConfig(params: NotificationDispatchParams, emailConfig: EmailConfigInput) {
  const apiBaseUrl = emailConfig.apiBaseUrl?.trim() || config.resendApiUrl
  const apiKey = emailConfig.apiKey?.trim()
  const from = emailConfig.from?.trim()
  const to = emailConfig.to?.trim()

  if (!apiBaseUrl || !apiKey || !from || !to) {
    throw new Error('邮箱通知未启用或配置不完整')
  }

  const response = await fetch(apiBaseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from,
      to: to
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      subject: buildNotificationTitle(params),
      text: buildNotificationBody(params)
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Resend 请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }
}

async function sendEmailNotification(params: NotificationDispatchParams): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  if (!settings.emailNotificationsEnabled) {
    return {
      channel: 'email',
      status: 'skipped',
      message: 'email_disabled'
    }
  }

  const alreadySent = await hasNotificationBeenSent('email', params)
  if (alreadySent) {
    return {
      channel: 'email',
      status: 'skipped',
      message: 'email_already_sent'
    }
  }

  await sendEmailWithConfig(params, settings.emailConfig)
  await markNotificationSent('email', params)

  return {
    channel: 'email',
    status: 'success'
  }
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

async function sendPushplusNotification(params: NotificationDispatchParams): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  if (!settings.pushplusNotificationsEnabled) {
    return {
      channel: 'pushplus',
      status: 'skipped',
      message: 'pushplus_disabled'
    }
  }

  const alreadySent = await hasNotificationBeenSent('pushplus', params)
  if (alreadySent) {
    return {
      channel: 'pushplus',
      status: 'skipped',
      message: 'pushplus_already_sent'
    }
  }

  await sendPushplusWithConfig(params, settings.pushplusConfig)
  await markNotificationSent('pushplus', params)

  return {
    channel: 'pushplus',
    status: 'success'
  }
}

async function sendTelegramWithConfig(params: NotificationDispatchParams, config: TelegramConfigInput) {
  const { botToken, chatId } = config
  if (!botToken || !chatId) {
    throw new Error('Telegram 通知未启用或配置不完整')
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${buildNotificationTitle(params)}\n\n${buildNotificationBody(params)}`
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Telegram 请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }

  let parsed: TelegramApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as TelegramApiResponse) : null
  } catch {
    throw new Error(`Telegram 返回了无法解析的响应：${rawText || 'empty response'}`)
  }

  if (!parsed?.ok) {
    throw new Error(`Telegram 请求被拒绝：${parsed?.description || rawText || 'unknown error'}`)
  }
}

async function sendTelegramNotification(params: NotificationDispatchParams): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  if (!settings.telegramNotificationsEnabled) {
    return {
      channel: 'telegram',
      status: 'skipped',
      message: 'telegram_disabled'
    }
  }

  const alreadySent = await hasNotificationBeenSent('telegram', params)
  if (alreadySent) {
    return {
      channel: 'telegram',
      status: 'skipped',
      message: 'telegram_already_sent'
    }
  }

  await sendTelegramWithConfig(params, settings.telegramConfig)
  await markNotificationSent('telegram', params)

  return {
    channel: 'telegram',
    status: 'success'
  }
}

export async function dispatchNotificationEvent(params: NotificationDispatchParams) {
  const results: NotificationChannelResult[] = []

  try {
    const webhookResult = await dispatchWebhookEvent(params)
    results.push(webhookResult)
  } catch (error) {
    results.push({
      channel: 'webhook',
      status: 'failed',
      message: error instanceof Error ? error.message : 'webhook_dispatch_failed'
    })
  }

  const emailResult = (await Promise.resolve(sendEmailNotification(params)).catch((error) => ({
    channel: 'email',
    status: 'failed',
    message: error instanceof Error ? error.message : 'email_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(emailResult)

  const pushplusResult = (await Promise.resolve(sendPushplusNotification(params)).catch((error) => ({
    channel: 'pushplus',
    status: 'failed',
    message: error instanceof Error ? error.message : 'pushplus_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(pushplusResult)

  const telegramResult = (await Promise.resolve(sendTelegramNotification(params)).catch((error) => ({
    channel: 'telegram',
    status: 'failed',
    message: error instanceof Error ? error.message : 'telegram_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(telegramResult)

  return results
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
  const result = await sendEmailNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:email',
    periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
    payload: buildTestReminderPayload()
  })

  if (result.status !== 'success') {
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
  const result = await sendPushplusNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:pushplus',
    periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
    payload: buildTestReminderPayload()
  })

  if (result.status !== 'success') {
    throw new Error('PushPlus 通知未启用或配置不完整')
  }

  return {
    accepted: true,
    message: 'PushPlus 已使用保存的配置发送测试请求'
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

export async function sendTestTelegramNotification() {
  const result = await sendTelegramNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:telegram',
    periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
    payload: buildTestReminderPayload()
  })

  if (result.status !== 'success') {
    throw new Error('Telegram 通知未启用或配置不完整')
  }

  return { success: true }
}

export async function sendTestTelegramNotificationWithConfig(config: TelegramConfigInput) {
  await sendTelegramWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:telegram',
      periodKey: `${new Date().toISOString().slice(0, 10)}:upcoming`,
      payload: buildTestReminderPayload()
    },
    config
  )

  return { success: true }
}
