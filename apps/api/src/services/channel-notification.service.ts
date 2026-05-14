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
import { prisma } from '../db'
import {
  buildDispatchParamsFromDedupEntries,
  type NotificationDedupEntry,
  type NotificationDispatchParams
} from './notification-merge.service'
import {
  buildNotificationMessage,
  formatNotificationDate,
  type DirectNotificationMessage
} from './notification-presentation.service'

export { formatNotificationDate } from './notification-presentation.service'

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

type ForgotPasswordNotificationPayload = {
  username: string
  code: string
  expiresInMinutes: number
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

type NotificationChannelSettings = Awaited<ReturnType<typeof getNotificationChannelSettings>>

const NOTIFICATION_DEDUP_KEY_PREFIX = 'notification:'
export const NOTIFICATION_DEDUP_RETENTION_DAYS = 30

export async function cleanupLegacyNotificationDedupSettings(
  now = new Date(),
  retentionDays = NOTIFICATION_DEDUP_RETENTION_DAYS
) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await prisma.setting.deleteMany({
    where: {
      key: {
        startsWith: NOTIFICATION_DEDUP_KEY_PREFIX
      },
      updatedAt: {
        lt: cutoff
      }
    }
  })

  return result.count
}

export async function cleanupNotificationDeliveryClaims(
  now = new Date(),
  retentionDays = NOTIFICATION_DEDUP_RETENTION_DAYS
) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  const notificationDelivery = (prisma as unknown as {
    notificationDelivery?: {
      deleteMany: (args: { where: { updatedAt: { lt: Date } } }) => Promise<{ count: number }>
    }
  }).notificationDelivery

  if (notificationDelivery) {
    const result = await notificationDelivery.deleteMany({
      where: {
        updatedAt: {
          lt: cutoff
        }
      }
    })

    return result.count
  }

  const cutoffIso = cutoff.toISOString()

  try {
    const result = await prisma.$executeRawUnsafe(
      'DELETE FROM NotificationDelivery WHERE updatedAt < ?',
      cutoffIso
    )
    return Number(result ?? 0)
  } catch {
    return 0
  }
}

async function withDeliveryClaim(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify',
  params: NotificationDispatchParams,
  send: () => Promise<void>
): Promise<NotificationChannelResult> {
  // Worker-lite keeps channel dedup as lightweight claim rows in NotificationDelivery.
  // These rows are only temporary occupancy markers for a channel+periodKey, not
  // a full delivery state machine. If the runtime crashes after claiming and before
  // release, a stale row may temporarily suppress retries until it is cleaned up.
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

function buildForgotPasswordTitle() {
  return 'SubTracker 密码重置验证码'
}

function buildForgotPasswordBody(payload: ForgotPasswordNotificationPayload) {
  return [
    `用户名：${payload.username}`,
    `验证码：${payload.code}`,
    `有效期：${payload.expiresInMinutes} 分钟`,
    '如果这不是你的操作，请忽略本次通知。'
  ].join('\n')
}

function buildForgotPasswordMessage(payload: ForgotPasswordNotificationPayload): DirectNotificationMessage {
  const text = buildForgotPasswordBody(payload)
  return {
    title: buildForgotPasswordTitle(),
    text,
    html: `<pre>${text}</pre>`
  }
}

async function sendResendEmailWithConfig(message: DirectNotificationMessage, config: ResendConfigInput) {
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
      subject: message.title,
      text: message.text
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Resend 请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }
}

async function sendEmailWithProvider(
  message: DirectNotificationMessage,
  provider: 'smtp' | 'resend',
  _smtpConfig: EmailConfigInput,
  resendConfig: ResendConfigInput
) {
  if (provider === 'smtp') {
    throw new Error('Cloudflare Worker 运行时暂不支持 SMTP，请改用 Resend')
  }

  await sendResendEmailWithConfig(message, resendConfig)
}

async function resolvePendingNotificationEntries(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify',
  params: NotificationDispatchParams
) {
  const dedupEntries = params.dedupEntries
  if (!dedupEntries?.length) {
    const claimed = await claimNotificationDelivery({
      channel,
      eventType: params.eventType,
      resourceKey: params.resourceKey,
      periodKey: params.periodKey
    })
    return claimed ? null : []
  }

  const pending: NotificationDedupEntry[] = []
  for (const entry of dedupEntries) {
    const claimed = await claimNotificationDelivery({
      channel,
      eventType: entry.eventType,
      resourceKey: entry.resourceKey,
      periodKey: entry.periodKey
    })

    if (claimed) {
      pending.push(entry)
    }
  }

  return pending
}

async function releaseNotificationEntries(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify',
  params: NotificationDispatchParams
) {
  if (params.dedupEntries?.length) {
    for (const entry of params.dedupEntries) {
      await releaseNotificationDelivery({
        channel,
        eventType: entry.eventType,
        resourceKey: entry.resourceKey,
        periodKey: entry.periodKey
      })
    }
    return
  }

  await releaseNotificationDelivery({
    channel,
    eventType: params.eventType,
    resourceKey: params.resourceKey,
    periodKey: params.periodKey
  })
}

function resolveDispatchParamsForChannel(
  params: NotificationDispatchParams,
  pendingEntries: NotificationDedupEntry[] | null
): NotificationDispatchParams | null {
  if (pendingEntries === null) {
    return params
  }

  if (pendingEntries.length === 0) {
    return null
  }

  return buildDispatchParamsFromDedupEntries(pendingEntries, {
    resourceKey: params.resourceKey,
    periodKey: params.periodKey
  })
}

type DirectChannelDispatchOptions = {
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify'
  enabled: boolean
  disabledMessage: string
  alreadySentMessage: string
  send: (message: DirectNotificationMessage) => Promise<void>
}

async function dispatchDirectChannelNotification(
  params: NotificationDispatchParams,
  options: DirectChannelDispatchOptions
): Promise<NotificationChannelResult> {
  if (!options.enabled) {
    return {
      channel: options.channel,
      status: 'skipped',
      message: options.disabledMessage
    }
  }

  const pendingEntries = await resolvePendingNotificationEntries(options.channel, params)
  const dispatchParams = resolveDispatchParamsForChannel(params, pendingEntries)
  if (!dispatchParams) {
    return {
      channel: options.channel,
      status: 'skipped',
      message: options.alreadySentMessage
    }
  }

  try {
    await options.send(buildNotificationMessage(dispatchParams))
  } catch (error) {
    await releaseNotificationEntries(options.channel, dispatchParams)
    throw error
  }

  return {
    channel: options.channel,
    status: 'success'
  }
}

async function sendEmailNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings
): Promise<NotificationChannelResult> {
  if (!settings.emailNotificationsEnabled) {
    return {
      channel: 'email',
      status: 'skipped',
      message: 'email_disabled'
    }
  }

  return dispatchDirectChannelNotification(params, {
    channel: 'email',
    enabled: settings.emailNotificationsEnabled,
    disabledMessage: 'email_disabled',
    alreadySentMessage: 'email_already_sent',
    send: (message) => sendEmailWithProvider(message, settings.emailProvider, settings.smtpConfig, settings.resendConfig)
  })
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
  message: DirectNotificationMessage,
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
      title: message.title,
      content: message.html || `<pre>${message.text}</pre>`,
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

async function sendPushplusNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'pushplus',
    enabled: settings.pushplusNotificationsEnabled,
    disabledMessage: 'pushplus_disabled',
    alreadySentMessage: 'pushplus_already_sent',
    send: (message) => sendPushplusWithConfig(message, settings.pushplusConfig).then(() => undefined)
  })
}

async function sendTelegramWithConfig(message: DirectNotificationMessage, config: TelegramConfigInput) {
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
      text: `${message.title}\n\n${message.text}`
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

async function sendTelegramNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'telegram',
    enabled: settings.telegramNotificationsEnabled,
    disabledMessage: 'telegram_disabled',
    alreadySentMessage: 'telegram_already_sent',
    send: (message) => sendTelegramWithConfig(message, settings.telegramConfig)
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

async function sendServerchanWithConfig(message: DirectNotificationMessage, config: ServerchanConfigInput) {
  const url = resolveServerchanUrl(config.sendkey)
  const body = new URLSearchParams({
    text: message.title,
    desp: message.text
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

async function sendServerchanNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'serverchan',
    enabled: settings.serverchanNotificationsEnabled,
    disabledMessage: 'serverchan_disabled',
    alreadySentMessage: 'serverchan_already_sent',
    send: (message) => sendServerchanWithConfig(message, settings.serverchanConfig)
  })
}

async function sendGotifyWithConfig(message: DirectNotificationMessage, config: GotifyConfigInput) {
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
      title: message.title,
      message: message.text,
      priority: '5'
    }).toString()
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Gotify 请求失败：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim())
  }
}

async function sendGotifyNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'gotify',
    enabled: settings.gotifyNotificationsEnabled,
    disabledMessage: 'gotify_disabled',
    alreadySentMessage: 'gotify_already_sent',
    send: (message) => sendGotifyWithConfig(message, settings.gotifyConfig)
  })
}

export async function dispatchNotificationEvent(params: NotificationDispatchParams) {
  const results: NotificationChannelResult[] = []
  const channelSettings = await getNotificationChannelSettings()

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

  const emailResult = (await Promise.resolve(sendEmailNotification(params, channelSettings)).catch((error) => ({
    channel: 'email',
    status: 'failed',
    message: error instanceof Error ? error.message : 'email_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(emailResult)

  const pushplusResult = (await Promise.resolve(sendPushplusNotification(params, channelSettings)).catch((error) => ({
    channel: 'pushplus',
    status: 'failed',
    message: error instanceof Error ? error.message : 'pushplus_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(pushplusResult)

  const telegramResult = (await Promise.resolve(sendTelegramNotification(params, channelSettings)).catch((error) => ({
    channel: 'telegram',
    status: 'failed',
    message: error instanceof Error ? error.message : 'telegram_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(telegramResult)

  const serverchanResult = (await Promise.resolve(sendServerchanNotification(params, channelSettings)).catch((error) => ({
    channel: 'serverchan',
    status: 'failed',
    message: error instanceof Error ? error.message : 'serverchan_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(serverchanResult)

  const gotifyResult = (await Promise.resolve(sendGotifyNotification(params, channelSettings)).catch((error) => ({
    channel: 'gotify',
    status: 'failed',
    message: error instanceof Error ? error.message : 'gotify_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(gotifyResult)

  const successCount = results.filter((result) => result.status === 'success').length
  const failed = results.filter((result) => result.status === 'failed')
  const skipped = results.filter((result) => result.status === 'skipped')
  const details = results
    .map((result) => `${result.channel}:${result.status}${result.message ? `(${result.message})` : ''}`)
    .join('；')
  const name = String(params.payload.name ?? params.resourceKey).trim() || params.resourceKey

  if (failed.length > 0) {
    console.warn(`[notification] ${name}：通知渠道 ${successCount} 个成功，${failed.length} 个失败，${skipped.length} 个跳过。${details}`)
  } else if (successCount > 0) {
    console.log(`[notification] ${name}：通知渠道 ${successCount} 个成功，${failed.length} 个失败，${skipped.length} 个跳过。${details}`)
  } else {
    console.log(`[notification] ${name}：所有通知渠道均已跳过。${details}`)
  }

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

async function buildTestReminderMessage() {
  const timezone = await getAppTimezone()
  return buildNotificationMessage({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:notification',
    periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
    payload: {
      ...buildTestReminderPayload(),
      nextRenewalDate: formatDateInTimezone(new Date(), timezone)
    }
  })
}

export async function sendTestEmailNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.emailNotificationsEnabled) {
    throw new Error('邮箱通知未启用或配置不完整')
  }

  await sendEmailWithProvider(await buildTestReminderMessage(), settings.emailProvider, settings.smtpConfig, settings.resendConfig)
}

export async function sendForgotPasswordVerificationCode(payload: ForgotPasswordNotificationPayload) {
  const settings = await getNotificationChannelSettings()
  const results: NotificationChannelResult[] = []
  const message = buildForgotPasswordMessage(payload)

  if (settings.emailNotificationsEnabled) {
    try {
      await sendEmailWithProvider(message, settings.emailProvider, settings.smtpConfig, settings.resendConfig)
      results.push({ channel: 'email', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'email',
        status: 'failed',
        message: error instanceof Error ? error.message : 'email_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'email', status: 'skipped', message: 'email_disabled' })
  }

  if (settings.pushplusNotificationsEnabled) {
    try {
      await sendPushplusWithConfig(message, settings.pushplusConfig)
      results.push({ channel: 'pushplus', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'pushplus',
        status: 'failed',
        message: error instanceof Error ? error.message : 'pushplus_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'pushplus', status: 'skipped', message: 'pushplus_disabled' })
  }

  if (settings.telegramNotificationsEnabled) {
    try {
      await sendTelegramWithConfig(message, settings.telegramConfig)
      results.push({ channel: 'telegram', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'telegram',
        status: 'failed',
        message: error instanceof Error ? error.message : 'telegram_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'telegram', status: 'skipped', message: 'telegram_disabled' })
  }

  if (settings.serverchanNotificationsEnabled) {
    try {
      await sendServerchanWithConfig(message, settings.serverchanConfig)
      results.push({ channel: 'serverchan', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'serverchan',
        status: 'failed',
        message: error instanceof Error ? error.message : 'serverchan_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'serverchan', status: 'skipped', message: 'serverchan_disabled' })
  }

  if (settings.gotifyNotificationsEnabled) {
    try {
      await sendGotifyWithConfig(message, settings.gotifyConfig)
      results.push({ channel: 'gotify', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'gotify',
        status: 'failed',
        message: error instanceof Error ? error.message : 'gotify_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'gotify', status: 'skipped', message: 'gotify_disabled' })
  }

  return results
}

export async function sendTestEmailNotificationWithConfig(config: {
  emailProvider: 'smtp' | 'resend'
  smtpConfig: EmailConfigInput
  resendConfig: ResendConfigInput
}) {
  await sendEmailWithProvider(await buildTestReminderMessage(), config.emailProvider, config.smtpConfig, config.resendConfig)
}

export async function sendTestPushplusNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.pushplusNotificationsEnabled) {
    throw new Error('PushPlus 通知未启用或配置不完整')
  }

  await sendPushplusWithConfig(await buildTestReminderMessage(), settings.pushplusConfig)

  return {
    accepted: true,
    message: 'PushPlus 已使用保存的配置发送测试请求'
  }
}

export async function sendTestPushplusNotificationWithConfig(config: PushPlusConfigInput) {
  return sendPushplusWithConfig(await buildTestReminderMessage(), config)
}

export async function sendTestTelegramNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.telegramNotificationsEnabled) {
    throw new Error('Telegram 通知未启用或配置不完整')
  }

  await sendTelegramWithConfig(await buildTestReminderMessage(), settings.telegramConfig)

  return { success: true }
}

export async function sendTestTelegramNotificationWithConfig(config: TelegramConfigInput) {
  await sendTelegramWithConfig(await buildTestReminderMessage(), config)

  return { success: true }
}

export async function sendTestServerchanNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.serverchanNotificationsEnabled) {
    throw new Error('Server 酱通知未启用或配置不完整')
  }

  await sendServerchanWithConfig(await buildTestReminderMessage(), settings.serverchanConfig)

  return { success: true }
}

export async function sendTestServerchanNotificationWithConfig(config: ServerchanConfigInput) {
  await sendServerchanWithConfig(await buildTestReminderMessage(), config)

  return { success: true }
}

export async function sendTestGotifyNotification() {
  const settings = await getNotificationChannelSettings()
  if (!settings.gotifyNotificationsEnabled) {
    throw new Error('Gotify 通知未启用或配置不完整')
  }

  await sendGotifyWithConfig(await buildTestReminderMessage(), settings.gotifyConfig)

  return { success: true }
}

export async function sendTestGotifyNotificationWithConfig(config: GotifyConfigInput) {
  await sendGotifyWithConfig(await buildTestReminderMessage(), config)

  return { success: true }
}
