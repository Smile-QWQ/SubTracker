import dayjs from 'dayjs'
import {
  DEFAULT_APP_LOCALE,
  DEFAULT_RESEND_API_URL,
  getMessage,
  isWorkerLiteBlockedSmtpPort,
  type AppLocale,
  type AppriseConfigInput,
  type BarkConfigInput,
  type EmailConfigInput,
  type GotifyConfigInput,
  type NotificationTemplateGroup,
  type NotifyxConfigInput,
  type ResendConfigInput,
  type PushPlusConfigInput,
  type ServerchanConfigInput,
  type TelegramConfigInput,
  type WebhookEventType
} from '@subtracker/shared'
import { dispatchWebhookEvent } from './webhook.service'
import { validateNotificationTargetUrl } from './notification-url.service'
import { getAppTimezone, getNotificationChannelSettings, getResolvedAppLocale } from './settings.service'
import { claimNotificationDelivery, releaseNotificationDelivery } from './worker-lite-state.service'
import { toIsoDate } from '../utils/date'
import { formatDateInTimezone } from '../utils/timezone'
import { prisma } from '../db'
import { createAppriseTemporaryKey, hasAppriseTargets, hasEnabledAppriseTargets } from './apprise-config.service'
import { deleteAppriseConfig, sendAppriseWithConfig, syncAppriseConfig } from './apprise-notification.service'
import {
  buildDispatchParamsFromDedupEntries,
  type NotificationDedupEntry,
  type NotificationDispatchParams
} from './notification-merge.service'
import {
  buildForgotPasswordNotificationMessage,
  buildNotificationMessage,
  buildTelegramMarkdownV2FromMarkdown,
  buildTestNotificationMessage,
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

type BarkApiResponse = {
  code?: number
  message?: string
}

type NotifyxApiResponse = {
  status?: string
  message?: string
  id?: number | string
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

type SmtpMailbox = {
  name?: string
  email: string
}

export type PushplusSendResult = {
  accepted: boolean
  code: number
  message: string
  shortCode?: string
}

export type NotificationChannelResult = {
  channel: 'webhook' | 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise'
  status: 'success' | 'skipped' | 'failed'
  message?: string
}

type NotificationChannelSettings = Awaited<ReturnType<typeof getNotificationChannelSettings>>
type NotificationLocaleContext = {
  locale?: AppLocale
  targetId?: string
}

const CHANNEL_TEMPLATE_GROUPS: Record<
  Exclude<NotificationChannelResult['channel'], 'webhook'>,
  NotificationTemplateGroup
> = {
  email: 'html',
  pushplus: 'html',
  telegram: 'markdown',
  serverchan: 'markdown',
  gotify: 'markdown',
  bark: 'markdown',
  notifyx: 'markdown',
  apprise: 'markdown'
}

const NOTIFICATION_DEDUP_KEY_PREFIX = 'notification:'
export const NOTIFICATION_DEDUP_RETENTION_DAYS = 30

function getNotificationFallbackMessage(locale: AppLocale, key: 'emptyResponse' | 'unknown') {
  return key === 'emptyResponse'
    ? getMessage(locale, 'common.fallbacks.emptyResponse')
    : getMessage(locale, 'common.fallbacks.unknown')
}

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

async function resolveNotificationLocale(locale?: AppLocale): Promise<AppLocale> {
  return locale ?? (await getResolvedAppLocale().catch(() => DEFAULT_APP_LOCALE))
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

function assertSupportedSmtpPort(port: number, locale: AppLocale) {
  if (isWorkerLiteBlockedSmtpPort(port)) {
    throw new Error(getMessage(locale, 'api.errors.notifications.smtpPort25Blocked'))
  }
}

function parseSmtpMailbox(value: string, fieldLabel: string, locale: AppLocale): SmtpMailbox {
  const raw = value.trim()
  if (!raw) {
    throw new Error(getMessage(locale, 'api.errors.notifications.smtpFieldRequired', { field: fieldLabel }))
  }

  const bracketMatch = raw.match(/^(.*)<([^<>]+)>$/)
  const mailbox = bracketMatch
    ? {
        name: bracketMatch[1]?.trim().replace(/^"(.*)"$/, '$1') || undefined,
        email: bracketMatch[2]?.trim() ?? ''
      }
    : { email: raw }

  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(mailbox.email)) {
    throw new Error(getMessage(locale, 'api.errors.notifications.smtpAddressInvalid', { field: fieldLabel, value: raw }))
  }

  return mailbox.name ? mailbox : { email: mailbox.email }
}

function parseSmtpRecipientList(value: string, locale: AppLocale): SmtpMailbox[] {
  const recipients = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (!recipients.length) {
    throw new Error(getMessage(locale, 'api.errors.notifications.smtpFieldRequired', { field: getMessage(locale, 'common.labels.to') }))
  }

  const recipientLabel = getMessage(locale, 'common.labels.to')
  return recipients.map((item, index) => parseSmtpMailbox(item, `${recipientLabel} #${index + 1}`, locale))
}

async function sendResendEmailWithConfig(message: DirectNotificationMessage, config: ResendConfigInput) {
  const apiBaseUrl = config.apiBaseUrl?.trim() || DEFAULT_RESEND_API_URL
  const apiKey = config.apiKey?.trim()
  const from = config.from?.trim()
  const to = config.to?.trim()

  if (!apiBaseUrl || !apiKey || !from || !to) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.emailDisabledOrIncomplete'))
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
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.resendRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }
}

async function sendSmtpEmailWithConfig(
  message: DirectNotificationMessage,
  config: EmailConfigInput,
  locale: AppLocale
) {
  const host = config.host?.trim()
  const port = Number(config.port ?? 0)
  const username = config.username?.trim()
  const password = config.password?.trim()
  const from = config.from?.trim()
  const to = config.to?.trim()

  if (!host || !Number.isInteger(port) || port <= 0 || !username || !password || !from || !to) {
    throw new Error(getMessage(locale, 'api.errors.notifications.emailDisabledOrIncomplete'))
  }

  assertSupportedSmtpPort(port, locale)

  const { WorkerMailer, LogLevel } = await import('worker-mailer')
  await WorkerMailer.send(
    {
      host,
      port,
      secure: Boolean(config.secure),
      credentials: {
        username,
        password
      },
      authType: ['plain', 'login', 'cram-md5'],
      logLevel: LogLevel.NONE
    },
    {
      from: parseSmtpMailbox(from, getMessage(locale, 'common.labels.from'), locale),
      to: parseSmtpRecipientList(to, locale),
      subject: message.title,
      text: message.text,
      html: message.html
    }
  )
}

async function sendEmailWithProvider(
  message: DirectNotificationMessage,
  provider: 'smtp' | 'resend',
  smtpConfig: EmailConfigInput,
  resendConfig: ResendConfigInput,
  locale: AppLocale = DEFAULT_APP_LOCALE
) {
  if (provider === 'smtp') {
    await sendSmtpEmailWithConfig(message, smtpConfig, locale)
    return
  }

  await sendResendEmailWithConfig(message, resendConfig)
}

async function resolvePendingNotificationEntries(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
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
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
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
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise'
  templateGroup: NotificationTemplateGroup
  templateConfig?: NotificationChannelSettings['notificationTemplateConfig']
  enabled: boolean
  disabledMessage: string
  alreadySentMessage: string
  send: (message: DirectNotificationMessage) => Promise<void>
}

async function dispatchDirectChannelNotification(
  params: NotificationDispatchParams,
  options: DirectChannelDispatchOptions,
  locale: AppLocale
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
    await options.send(
      buildNotificationMessage(dispatchParams, locale, {
        group: options.templateGroup,
        templateConfig: options.templateConfig
      })
    )
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
  settings: NotificationChannelSettings,
  locale: AppLocale
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
    templateGroup: CHANNEL_TEMPLATE_GROUPS.email,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.emailNotificationsEnabled,
    disabledMessage: 'email_disabled',
    alreadySentMessage: 'email_already_sent',
    send: (message) => sendEmailWithProvider(message, settings.emailProvider, settings.smtpConfig, settings.resendConfig, locale)
  }, locale)
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
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusDisabledOrIncomplete'))
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
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: PushplusApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as PushplusApiResponse) : null
  } catch {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusInvalidResponse')}：${rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'emptyResponse')}`
    )
  }

  if (!parsed || parsed.code !== 200) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusRejected')}：${parsed?.msg || rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'unknown')}`
    )
  }

  return {
    accepted: true,
    code: parsed.code,
    message: parsed.msg || getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusSubmitted'),
    shortCode: extractPushplusShortCode(parsed.data)
  }
}

async function sendPushplusNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'pushplus',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.pushplus,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.pushplusNotificationsEnabled,
    disabledMessage: 'pushplus_disabled',
    alreadySentMessage: 'pushplus_already_sent',
    send: (message) => sendPushplusWithConfig(message, settings.pushplusConfig).then(() => undefined)
  }, locale)
}

async function sendTelegramWithConfig(message: DirectNotificationMessage, config: TelegramConfigInput) {
  const { botToken, chatId } = config
  if (!botToken || !chatId) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramDisabledOrIncomplete'))
  }

  const titleMarkdown = buildTelegramMarkdownV2FromMarkdown(`**${message.title}**`)
  const bodyMarkdown = buildTelegramMarkdownV2FromMarkdown(message.markdown || message.text)

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: [titleMarkdown, bodyMarkdown].filter(Boolean).join('\n\n'),
      parse_mode: 'MarkdownV2'
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: TelegramApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as TelegramApiResponse) : null
  } catch {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramInvalidResponse')}：${rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'emptyResponse')}`
    )
  }

  if (!parsed?.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramRejected')}：${parsed?.description || rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'unknown')}`
    )
  }
}

async function sendTelegramNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'telegram',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.telegram,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.telegramNotificationsEnabled,
    disabledMessage: 'telegram_disabled',
    alreadySentMessage: 'telegram_already_sent',
    send: (message) => sendTelegramWithConfig(message, settings.telegramConfig)
  }, locale)
}

function resolveServerchanUrl(sendkey: string) {
  const trimmed = sendkey.trim()
  if (!trimmed) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanDisabledOrIncomplete'))
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
    desp: message.markdown || message.text
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
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: { code?: number; message?: string } | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as { code?: number; message?: string }) : null
  } catch {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanInvalidResponse')}：${rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'emptyResponse')}`
    )
  }

  if (!parsed || parsed.code !== 0) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanRejected')}：${parsed?.message || rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'unknown')}`
    )
  }
}

async function sendServerchanNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'serverchan',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.serverchan,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.serverchanNotificationsEnabled,
    disabledMessage: 'serverchan_disabled',
    alreadySentMessage: 'serverchan_already_sent',
    send: (message) => sendServerchanWithConfig(message, settings.serverchanConfig)
  }, locale)
}

async function sendGotifyWithConfig(message: DirectNotificationMessage, config: GotifyConfigInput) {
  const target = validateNotificationTargetUrl(config.url.trim(), 'Gotify URL')
  const token = config.token?.trim()
  if (!token) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.gotifyDisabledOrIncomplete'))
  }

  const response = await fetch(new URL(`/message?token=${encodeURIComponent(token)}`, target.toString()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: message.title,
      message: message.markdown || message.text,
      priority: 5,
      extras: {
        client: {
          display: {
            contentType: 'text/markdown'
          }
        }
      }
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.gotifyRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }
}

async function sendGotifyNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'gotify',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.gotify,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.gotifyNotificationsEnabled,
    disabledMessage: 'gotify_disabled',
    alreadySentMessage: 'gotify_already_sent',
    send: (message) => sendGotifyWithConfig(message, settings.gotifyConfig)
  }, locale)
}

function isBarkCustomServerUrl(target: URL) {
  return target.pathname.replace(/\/+$/, '') !== ''
}

async function sendBarkWithConfig(message: DirectNotificationMessage, config: BarkConfigInput) {
  const serverUrl = config.serverUrl?.trim()
  const deviceKey = config.deviceKey?.trim()
  if (!serverUrl) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkDisabledOrIncomplete'))
  }

  const target = validateNotificationTargetUrl(serverUrl, 'Bark Server URL')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (target.username) {
    const username = decodeURIComponent(target.username)
    const password = decodeURIComponent(target.password || '')
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    target.username = ''
    target.password = ''
  }

  const includeDeviceKey = !isBarkCustomServerUrl(target)
  if (includeDeviceKey) {
    if (!deviceKey) {
      throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkDisabledOrIncomplete'))
    }
    target.pathname = '/push'
    target.search = ''
    target.hash = ''
  }

  const response = await fetch(target, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: message.title,
      ...(message.markdown ? { markdown: message.markdown } : { body: message.text }),
      ...(includeDeviceKey ? { device_key: deviceKey } : {}),
      ...(config.isArchive ? { isArchive: 1 } : {})
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: BarkApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as BarkApiResponse) : null
  } catch {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkInvalidResponse')}：${rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'emptyResponse')}`
    )
  }

  if (!parsed || parsed.code !== 200) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkRejected')}：${parsed?.message || rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'unknown')}`
    )
  }
}

async function sendBarkNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'bark',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.bark,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.barkNotificationsEnabled,
    disabledMessage: 'bark_disabled',
    alreadySentMessage: 'bark_already_sent',
    send: (message) => sendBarkWithConfig(message, settings.barkConfig)
  }, locale)
}

function normalizeMarkdownNotificationText(text: string) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n')
}

function buildNotifyxDescription(title: string) {
  return `SubTracker · ${title}`.slice(0, 500)
}

async function sendNotifyxWithConfig(message: DirectNotificationMessage, config: NotifyxConfigInput) {
  const apiKey = config.apiKey?.trim()
  if (!apiKey) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxDisabledOrIncomplete'))
  }

  const response = await fetch(`https://www.notifyx.cn/api/v1/send/${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: message.title,
      content: normalizeMarkdownNotificationText(message.markdown || message.text),
      description: buildNotifyxDescription(message.title),
      team: config.team?.trim() || undefined
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxRequestFailed')}：HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: NotifyxApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as NotifyxApiResponse) : null
  } catch {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxInvalidResponse')}：${rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'emptyResponse')}`
    )
  }

  if (!parsed || parsed.status !== 'queued') {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxRejected')}：${parsed?.message || rawText || getNotificationFallbackMessage(DEFAULT_APP_LOCALE, 'unknown')}`
    )
  }
}

async function sendNotifyxNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'notifyx',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.notifyx,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.notifyxNotificationsEnabled,
    disabledMessage: 'notifyx_disabled',
    alreadySentMessage: 'notifyx_already_sent',
    send: (message) => sendNotifyxWithConfig(message, settings.notifyxConfig)
  }, locale)
}

async function sendAppriseNotification(
  params: NotificationDispatchParams,
  settings: NotificationChannelSettings,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  return dispatchDirectChannelNotification(params, {
    channel: 'apprise',
    templateGroup: CHANNEL_TEMPLATE_GROUPS.apprise,
    templateConfig: settings.notificationTemplateConfig,
    enabled: settings.appriseNotificationsEnabled && hasEnabledAppriseTargets(settings.appriseConfig),
    disabledMessage: 'apprise_disabled',
    alreadySentMessage: 'apprise_already_sent',
    send: (message) =>
      sendAppriseWithConfig(message, settings.appriseConfig, {
        locale,
        syncBeforeSend: settings.appriseConfig.lastSyncStatus !== 'synced'
      })
  }, locale)
}

export async function dispatchNotificationEvent(
  params: NotificationDispatchParams,
  context: NotificationLocaleContext = {}
) {
  const results: NotificationChannelResult[] = []
  const channelSettings = await getNotificationChannelSettings()
  const locale = await resolveNotificationLocale(context.locale)

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

  const emailResult = (await Promise.resolve(sendEmailNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'email',
    status: 'failed',
    message: error instanceof Error ? error.message : 'email_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(emailResult)

  const pushplusResult = (await Promise.resolve(sendPushplusNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'pushplus',
    status: 'failed',
    message: error instanceof Error ? error.message : 'pushplus_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(pushplusResult)

  const telegramResult = (await Promise.resolve(sendTelegramNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'telegram',
    status: 'failed',
    message: error instanceof Error ? error.message : 'telegram_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(telegramResult)

  const serverchanResult = (await Promise.resolve(sendServerchanNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'serverchan',
    status: 'failed',
    message: error instanceof Error ? error.message : 'serverchan_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(serverchanResult)

  const gotifyResult = (await Promise.resolve(sendGotifyNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'gotify',
    status: 'failed',
    message: error instanceof Error ? error.message : 'gotify_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(gotifyResult)

  const barkResult = (await Promise.resolve(sendBarkNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'bark',
    status: 'failed',
    message: error instanceof Error ? error.message : 'bark_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(barkResult)

  const notifyxResult = (await Promise.resolve(sendNotifyxNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'notifyx',
    status: 'failed',
    message: error instanceof Error ? error.message : 'notifyx_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(notifyxResult)

  const appriseResult = (await Promise.resolve(sendAppriseNotification(params, channelSettings, locale)).catch((error) => ({
    channel: 'apprise',
    status: 'failed',
    message: error instanceof Error ? error.message : 'apprise_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(appriseResult)

  const successCount = results.filter((result) => result.status === 'success').length
  const failed = results.filter((result) => result.status === 'failed')
  const skipped = results.filter((result) => result.status === 'skipped')
  const details = results
    .map((result) => `${result.channel}:${result.status}${result.message ? `(${result.message})` : ''}`)
    .join(getMessage(locale, 'common.separators.notificationDetail'))
  const name = String(params.payload.name ?? params.resourceKey).trim() || params.resourceKey

  if (failed.length > 0) {
    console.warn(
      getMessage(locale, 'api.runtime.notificationDispatchSummary', {
        name,
        success: successCount,
        failed: failed.length,
        skipped: skipped.length,
        details
      })
    )
  } else if (successCount > 0) {
    console.log(
      getMessage(locale, 'api.runtime.notificationDispatchSummary', {
        name,
        success: successCount,
        failed: failed.length,
        skipped: skipped.length,
        details
      })
    )
  } else {
    console.log(getMessage(locale, 'api.runtime.notificationDispatchAllSkipped', { name, details }))
  }

  return results
}

function buildTestReminderPayload(locale: AppLocale) {
  return {
    name: getMessage(locale, 'notifications.tests.subscriptionName'),
    nextRenewalDate: '',
    amount: 19.9,
    currency: 'CNY',
    tagNames: [getMessage(locale, 'notifications.tests.tagName')],
    websiteUrl: 'https://example.com',
    notes: getMessage(locale, 'notifications.tests.note'),
    phase: 'upcoming',
    daysUntilRenewal: 3,
    daysOverdue: 0
  }
}

async function buildTestReminderMessage(
  locale: AppLocale,
  group: NotificationTemplateGroup = 'text',
  templateConfig?: NotificationChannelSettings['notificationTemplateConfig']
) {
  const timezone = await getAppTimezone()
  return buildTestNotificationMessage(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:notification',
      periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
      payload: {
        ...buildTestReminderPayload(locale),
        nextRenewalDate: formatDateInTimezone(new Date(), timezone)
      }
    },
    locale,
    {
      group,
      templateConfig
    }
  )
}

function buildStoredTestMessage(
  settings: NotificationChannelSettings,
  channel: keyof typeof CHANNEL_TEMPLATE_GROUPS,
  locale: AppLocale
) {
  return buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS[channel], settings.notificationTemplateConfig)
}

export async function sendTestEmailNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.emailNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.emailDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendEmailWithProvider(
    await buildStoredTestMessage(settings, 'email', locale),
    settings.emailProvider,
    settings.smtpConfig,
    settings.resendConfig,
    locale
  )
}

export async function sendForgotPasswordVerificationCode(
  payload: ForgotPasswordNotificationPayload,
  context: NotificationLocaleContext = {}
) {
  const settings = await getNotificationChannelSettings()
  const results: NotificationChannelResult[] = []
  const locale = await resolveNotificationLocale(context.locale)
  const buildChannelMessage = (channel: keyof typeof CHANNEL_TEMPLATE_GROUPS) =>
    buildForgotPasswordNotificationMessage(payload, locale, {
      group: CHANNEL_TEMPLATE_GROUPS[channel],
      templateConfig: settings.notificationTemplateConfig
    })

  if (settings.emailNotificationsEnabled) {
    try {
      await sendEmailWithProvider(buildChannelMessage('email'), settings.emailProvider, settings.smtpConfig, settings.resendConfig, locale)
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
      await sendPushplusWithConfig(buildChannelMessage('pushplus'), settings.pushplusConfig)
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
      await sendTelegramWithConfig(buildChannelMessage('telegram'), settings.telegramConfig)
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
      await sendServerchanWithConfig(buildChannelMessage('serverchan'), settings.serverchanConfig)
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
      await sendGotifyWithConfig(buildChannelMessage('gotify'), settings.gotifyConfig)
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

  if (settings.barkNotificationsEnabled) {
    try {
      await sendBarkWithConfig(buildChannelMessage('bark'), settings.barkConfig)
      results.push({ channel: 'bark', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'bark',
        status: 'failed',
        message: error instanceof Error ? error.message : 'bark_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'bark', status: 'skipped', message: 'bark_disabled' })
  }

  if (settings.notifyxNotificationsEnabled) {
    try {
      await sendNotifyxWithConfig(buildChannelMessage('notifyx'), settings.notifyxConfig)
      results.push({ channel: 'notifyx', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'notifyx',
        status: 'failed',
        message: error instanceof Error ? error.message : 'notifyx_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'notifyx', status: 'skipped', message: 'notifyx_disabled' })
  }

  if (settings.appriseNotificationsEnabled && hasEnabledAppriseTargets(settings.appriseConfig)) {
    try {
      await sendAppriseWithConfig(buildChannelMessage('apprise'), settings.appriseConfig, {
        locale,
        syncBeforeSend: settings.appriseConfig.lastSyncStatus !== 'synced'
      })
      results.push({ channel: 'apprise', status: 'success' })
    } catch (error) {
      results.push({
        channel: 'apprise',
        status: 'failed',
        message: error instanceof Error ? error.message : 'apprise_dispatch_failed'
      })
    }
  } else {
    results.push({ channel: 'apprise', status: 'skipped', message: 'apprise_disabled' })
  }

  return results
}

export async function sendTestEmailNotificationWithConfig(config: {
  emailProvider: 'smtp' | 'resend'
  smtpConfig: EmailConfigInput
  resendConfig: ResendConfigInput
}, context: NotificationLocaleContext = {}) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  await sendEmailWithProvider(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.email, settings.notificationTemplateConfig),
    config.emailProvider,
    config.smtpConfig,
    config.resendConfig,
    locale
  )
}

export async function sendTestPushplusNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.pushplusNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.pushplusDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendPushplusWithConfig(await buildStoredTestMessage(settings, 'pushplus', locale), settings.pushplusConfig)

  return {
    accepted: true,
    message: getMessage(locale, 'settings.messages.pushplusTestSubmitted')
  }
}

export async function sendTestPushplusNotificationWithConfig(
  config: PushPlusConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  return sendPushplusWithConfig(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.pushplus, settings.notificationTemplateConfig),
    config
  )
}

export async function sendTestTelegramNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.telegramNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.telegramDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendTelegramWithConfig(await buildStoredTestMessage(settings, 'telegram', locale), settings.telegramConfig)

  return { success: true }
}

export async function sendTestTelegramNotificationWithConfig(
  config: TelegramConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  await sendTelegramWithConfig(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.telegram, settings.notificationTemplateConfig),
    config
  )

  return { success: true }
}

export async function sendTestServerchanNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.serverchanNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.serverchanDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendServerchanWithConfig(await buildStoredTestMessage(settings, 'serverchan', locale), settings.serverchanConfig)

  return { success: true }
}

export async function sendTestServerchanNotificationWithConfig(
  config: ServerchanConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  await sendServerchanWithConfig(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.serverchan, settings.notificationTemplateConfig),
    config
  )

  return { success: true }
}

export async function sendTestGotifyNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.gotifyNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.gotifyDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendGotifyWithConfig(await buildStoredTestMessage(settings, 'gotify', locale), settings.gotifyConfig)

  return { success: true }
}

export async function sendTestGotifyNotificationWithConfig(
  config: GotifyConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  await sendGotifyWithConfig(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.gotify, settings.notificationTemplateConfig),
    config
  )

  return { success: true }
}

export async function sendTestBarkNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.barkNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.barkDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendBarkWithConfig(await buildStoredTestMessage(settings, 'bark', locale), settings.barkConfig)

  return { success: true }
}

export async function sendTestBarkNotificationWithConfig(
  config: BarkConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  await sendBarkWithConfig(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.bark, settings.notificationTemplateConfig),
    config
  )

  return { success: true }
}

export async function sendTestNotifyxNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.notifyxNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.notifyxDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendNotifyxWithConfig(await buildStoredTestMessage(settings, 'notifyx', locale), settings.notifyxConfig)

  return { success: true }
}

export async function sendTestNotifyxNotificationWithConfig(
  config: NotifyxConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  await sendNotifyxWithConfig(
    await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.notifyx, settings.notificationTemplateConfig),
    config
  )

  return { success: true }
}

export async function sendTestAppriseNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (
    !settings.appriseNotificationsEnabled ||
    !hasAppriseTargets(settings.appriseConfig) ||
    (!context.targetId && !hasEnabledAppriseTargets(settings.appriseConfig))
  ) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.appriseDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendAppriseWithConfig(await buildStoredTestMessage(settings, 'apprise', locale), settings.appriseConfig, {
    locale,
    targetId: context.targetId,
    syncBeforeSend: settings.appriseConfig.lastSyncStatus !== 'synced'
  })

  return { success: true }
}

export async function sendTestAppriseNotificationWithConfig(
  config: AppriseConfigInput,
  context: NotificationLocaleContext = {}
) {
  if (!hasAppriseTargets(config) || (!context.targetId && !hasEnabledAppriseTargets(config))) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.appriseDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  const settings = await getNotificationChannelSettings()
  const temporaryKey = createAppriseTemporaryKey(config.key)

  try {
    await syncAppriseConfig(config, {
      locale,
      keyOverride: temporaryKey
    })

    await sendAppriseWithConfig(
      await buildTestReminderMessage(locale, CHANNEL_TEMPLATE_GROUPS.apprise, settings.notificationTemplateConfig),
      config,
      {
        locale,
        targetId: context.targetId,
        keyOverride: temporaryKey
      }
    )

    return { success: true }
  } finally {
    await deleteAppriseConfig(config, temporaryKey, locale)
  }
}
