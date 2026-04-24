import dayjs from 'dayjs'
import {
  DEFAULT_RESEND_API_URL,
  type EmailConfigInput,
  type GotifyConfigInput,
  type ResendConfigInput,
  type PushPlusConfigInput,
  type ServerchanConfigInput,
  type TelegramConfigInput,
  type WebhookEventType
} from '@subtracker/shared'
import { dispatchWebhookEvent } from './webhook.service'
import { validateNotificationTargetUrl } from './notification-url.service'
import { getAppTimezone, getNotificationChannelSettings } from './settings.service'
import { claimNotificationDelivery, releaseNotificationDelivery } from './worker-lite-state.service'
import { toIsoDate } from '../utils/date'
import { formatDateInTimezone } from '../utils/timezone'

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
  channel: 'webhook' | 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify'
  status: 'success' | 'skipped' | 'failed'
  message?: string
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
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
        subscription.daysOverdue !== undefined && subscription.daysOverdue > 0 ? `过期 ${subscription.daysOverdue} 天` : null
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
    const lines = [`提醒类型：${getPhaseLabel(params)}`, `订阅数量：${mergedSubscriptions.length} 项`, '']

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
        subscription.daysOverdue !== undefined && subscription.daysOverdue > 0 ? `过期 ${subscription.daysOverdue} 天` : null
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

async function withDeliveryClaim(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify',
  params: NotificationDispatchParams,
  send: () => Promise<void>
): Promise<NotificationChannelResult> {
  const claimed = await claimNotificationDelivery({
    channel,
    eventType: params.eventType,
    resourceKey: params.resourceKey,
    periodKey: params.periodKey
  })

  if (!claimed) {
    return {
      channel,
      status: 'skipped',
      message: `${channel}_already_sent`
    }
  }

  try {
    await send()
  } catch (error) {
    await releaseNotificationDelivery({
      channel,
      eventType: params.eventType,
      resourceKey: params.resourceKey,
      periodKey: params.periodKey
    })
    throw error
  }

  return {
    channel,
    status: 'success'
  }
}

async function sendResendEmailWithConfig(params: NotificationDispatchParams, config: ResendConfigInput) {
  const apiBaseUrl = config.apiBaseUrl?.trim() || DEFAULT_RESEND_API_URL
  const apiKey = config.apiKey?.trim()
  const from = config.from?.trim()
  const to = config.to?.trim()

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

async function sendEmailWithProvider(
  params: NotificationDispatchParams,
  provider: 'smtp' | 'resend',
  _smtpConfig: EmailConfigInput,
  resendConfig: ResendConfigInput
) {
  if (provider === 'smtp') {
    throw new Error('Cloudflare Worker 运行时暂不支持 SMTP，请改用 Resend')
  }

  await sendResendEmailWithConfig(params, resendConfig)
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

  return withDeliveryClaim('email', params, () =>
    sendEmailWithProvider(params, settings.emailProvider, settings.smtpConfig, settings.resendConfig)
  )
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

  return withDeliveryClaim('pushplus', params, async () => {
    await sendPushplusWithConfig(params, settings.pushplusConfig)
  })
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

  return withDeliveryClaim('telegram', params, async () => {
    await sendTelegramWithConfig(params, settings.telegramConfig)
  })
}

function resolveServerchanUrl(sendkey: string) {
  const trimmed = sendkey.trim()
  if (!trimmed) {
    throw new Error('Server 酱通知未启用或配置不完整')
  }

  if (trimmed.startsWith('sctp')) {
    const matches = trimmed.match(/^sctp(\d+)t/i)
    const shard = matches?.[1]
    if (shard) {
      return `https://${shard}.push.ft07.com/send/${trimmed}.send`
    }
  }

  return `https://sctapi.ftqq.com/${trimmed}.send`
}

async function sendServerchanWithConfig(params: NotificationDispatchParams, config: ServerchanConfigInput) {
  const url = resolveServerchanUrl(config.sendkey)
  const body = new URLSearchParams({
    text: buildNotificationTitle(params),
    desp: buildNotificationBody(params)
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Server 酱请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }

  let parsed: { code?: number; message?: string } | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as { code?: number; message?: string }) : null
  } catch {
    throw new Error(`Server 酱返回了无法解析的响应：${rawText || 'empty response'}`)
  }

  if (!parsed || parsed.code !== 0) {
    throw new Error(`Server 酱请求被拒绝：${parsed?.message || rawText || 'unknown error'}`)
  }
}

async function sendServerchanNotification(params: NotificationDispatchParams): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  if (!settings.serverchanNotificationsEnabled) {
    return {
      channel: 'serverchan',
      status: 'skipped',
      message: 'serverchan_disabled'
    }
  }

  return withDeliveryClaim('serverchan', params, async () => {
    await sendServerchanWithConfig(params, settings.serverchanConfig)
  })
}

async function sendGotifyWithConfig(params: NotificationDispatchParams, config: GotifyConfigInput) {
  const target = validateNotificationTargetUrl(config.url.trim(), 'Gotify URL')
  const token = config.token?.trim()
  if (!token) {
    throw new Error('Gotify 通知未启用或配置不完整')
  }

  const response = await fetch(new URL(`/message?token=${encodeURIComponent(token)}`, target.toString()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      title: buildNotificationTitle(params),
      message: buildNotificationBody(params),
      priority: '5'
    }).toString()
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Gotify 请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }
}

async function sendGotifyNotification(params: NotificationDispatchParams): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  if (!settings.gotifyNotificationsEnabled) {
    return {
      channel: 'gotify',
      status: 'skipped',
      message: 'gotify_disabled'
    }
  }

  return withDeliveryClaim('gotify', params, async () => {
    await sendGotifyWithConfig(params, settings.gotifyConfig)
  })
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

  const serverchanResult = (await Promise.resolve(sendServerchanNotification(params)).catch((error) => ({
    channel: 'serverchan',
    status: 'failed',
    message: error instanceof Error ? error.message : 'serverchan_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(serverchanResult)

  const gotifyResult = (await Promise.resolve(sendGotifyNotification(params)).catch((error) => ({
    channel: 'gotify',
    status: 'failed',
    message: error instanceof Error ? error.message : 'gotify_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(gotifyResult)

  return results
}

function buildTestReminderPayload() {
  return {
    name: '测试订阅',
    nextRenewalDate: '',
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
  const settings = await getNotificationChannelSettings()
  if (!settings.emailNotificationsEnabled) {
    throw new Error('邮箱通知未启用或配置不完整')
  }
  const timezone = await getAppTimezone()

  await sendEmailWithProvider(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:email',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    settings.emailProvider,
    settings.smtpConfig,
    settings.resendConfig
  )
}

export async function sendTestEmailNotificationWithConfig(config: {
  emailProvider: 'smtp' | 'resend'
  smtpConfig: EmailConfigInput
  resendConfig: ResendConfigInput
}) {
  const timezone = await getAppTimezone()
  await sendEmailWithProvider(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:email',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    config.emailProvider,
    config.smtpConfig,
    config.resendConfig
  )
}

export async function sendTestPushplusNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.pushplusNotificationsEnabled) {
    throw new Error('PushPlus 通知未启用或配置不完整')
  }

  const timezone = await getAppTimezone()
  await sendPushplusWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:pushplus',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    settings.pushplusConfig
  )

  return {
    accepted: true,
    message: 'PushPlus 已使用保存的配置发送测试请求'
  }
}

export async function sendTestPushplusNotificationWithConfig(config: PushPlusConfigInput) {
  const timezone = await getAppTimezone()
  return sendPushplusWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:pushplus',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    config
  )
}

export async function sendTestTelegramNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.telegramNotificationsEnabled) {
    throw new Error('Telegram 通知未启用或配置不完整')
  }

  const timezone = await getAppTimezone()
  await sendTelegramWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:telegram',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    settings.telegramConfig
  )

  return { success: true }
}

export async function sendTestTelegramNotificationWithConfig(config: TelegramConfigInput) {
  const timezone = await getAppTimezone()
  await sendTelegramWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:telegram',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    config
  )

  return { success: true }
}

export async function sendTestServerchanNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.serverchanNotificationsEnabled) {
    throw new Error('Server 酱通知未启用或配置不完整')
  }

  const timezone = await getAppTimezone()
  await sendServerchanWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:serverchan',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    settings.serverchanConfig
  )

  return { success: true }
}

export async function sendTestServerchanNotificationWithConfig(config: ServerchanConfigInput) {
  const timezone = await getAppTimezone()
  await sendServerchanWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:serverchan',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    config
  )

  return { success: true }
}

export async function sendTestGotifyNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.gotifyNotificationsEnabled) {
    throw new Error('Gotify 通知未启用或配置不完整')
  }

  const timezone = await getAppTimezone()
  await sendGotifyWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:gotify',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    settings.gotifyConfig
  )

  return { success: true }
}

export async function sendTestGotifyNotificationWithConfig(config: GotifyConfigInput) {
  const timezone = await getAppTimezone()
  await sendGotifyWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:gotify',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    config
  )

  return { success: true }
}
