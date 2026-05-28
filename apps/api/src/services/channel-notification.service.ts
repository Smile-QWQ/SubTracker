import http from 'node:http'
import https from 'node:https'
import nodemailer from 'nodemailer'
import {
  DEFAULT_RESEND_API_URL,
  DEFAULT_APP_LOCALE,
  getMessage,
  type AppLocale,
  type AppriseConfigInput,
  type BarkConfigInput,
  type EmailConfigInput,
  type GotifyConfigInput,
  type NotifyxConfigInput,
  type ResendConfigInput,
  type PushPlusConfigInput,
  type ServerchanConfigInput,
  type TelegramConfigInput
} from '@subtracker/shared'
import { dispatchWebhookEvent } from './webhook.service'
import { getAppTimezone, getNotificationChannelSettings, getResolvedAppLocale, getSetting, setSetting } from './settings.service'
import { validateNotificationTargetUrl } from './notification-url.service'
import { createAppriseTemporaryKey, hasAppriseTargets, hasEnabledAppriseTargets } from './apprise-config.service'
import { deleteAppriseConfig, sendAppriseWithConfig, syncAppriseConfig } from './apprise-notification.service'
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
  type DirectNotificationMessage
} from './notification-presentation.service'

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

type ForgotPasswordNotificationPayload = {
  username: string
  code: string
  expiresInMinutes: number
}

type NotificationLocaleContext = {
  locale?: AppLocale
  targetId?: string
}

type DirectChannelDispatchOptions = {
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise'
  enabled: boolean
  disabledMessage: string
  alreadySentMessage: string
  send: (message: DirectNotificationMessage) => Promise<void>
}

const NOTIFICATION_DEDUP_KEY_PREFIX = 'notification:'
export const NOTIFICATION_DEDUP_RETENTION_DAYS = 30

function buildNotificationKey(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
  params: NotificationDispatchParams
) {
  return `${NOTIFICATION_DEDUP_KEY_PREFIX}${channel}:${params.eventType}:${params.resourceKey}:${params.periodKey}`
}

export async function cleanupOldNotificationDedupSettings(
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

async function resolveNotificationLocale(locale?: AppLocale): Promise<AppLocale> {
  return locale ?? (await getResolvedAppLocale().catch(() => DEFAULT_APP_LOCALE))
}

function getNotificationLogName(params: NotificationDispatchParams) {
  const name = params.payload.name
  return typeof name === 'string' && name.trim() ? name.trim() : params.resourceKey
}

function formatChannelResult(result: NotificationChannelResult, locale: AppLocale) {
  const label = getMessage(locale, `notifications.channels.${result.channel}`)
  const status = getMessage(locale, `notifications.status.${result.status}`)
  const detailWrapperStart = getMessage(locale, 'notifications.wrappers.detailStart')
  const detailWrapperEnd = getMessage(locale, 'notifications.wrappers.detailEnd')
  return result.message ? `${label}${status}${detailWrapperStart}${result.message}${detailWrapperEnd}` : `${label}${status}`
}

function logNotificationDispatch(params: NotificationDispatchParams, results: NotificationChannelResult[], locale: AppLocale) {
  const successCount = results.filter((result) => result.status === 'success').length
  const failed = results.filter((result) => result.status === 'failed')
  const skipped = results.filter((result) => result.status === 'skipped')
  const details = results.map((result) => formatChannelResult(result, locale)).join(getMessage(locale, 'common.separators.notificationDetail'))
  const baseMessage = getMessage(locale, 'notifications.logs.dispatchSummary', {
    name: getNotificationLogName(params),
    successCount,
    failedCount: failed.length,
    skippedCount: skipped.length,
    details
  })

  if (failed.length) {
    console.warn(baseMessage)
    return
  }

  if (successCount > 0) {
    console.log(baseMessage)
    return
  }

  console.log(
    getMessage(locale, 'notifications.logs.allSkipped', {
      name: getNotificationLogName(params),
      details
    })
  )
}

async function hasNotificationBeenSent(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
  params: NotificationDispatchParams
) {
  return getSetting<boolean>(buildNotificationKey(channel, params), false)
}

async function markNotificationSent(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
  params: NotificationDispatchParams
) {
  await setSetting(buildNotificationKey(channel, params), true)
}

async function resolvePendingNotificationEntries(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
  params: NotificationDispatchParams
) {
  const dedupEntries = params.dedupEntries
  if (!dedupEntries?.length) {
    const alreadySent = await hasNotificationBeenSent(channel, params)
    return alreadySent ? [] : null
  }

  const pending: NotificationDedupEntry[] = []
  for (const entry of dedupEntries) {
    const alreadySent = await hasNotificationBeenSent(channel, buildDispatchParamsFromDedupEntries([entry]))
    if (!alreadySent) {
      pending.push(entry)
    }
  }

  return pending
}

async function markNotificationEntriesSent(
  channel: 'email' | 'pushplus' | 'telegram' | 'serverchan' | 'gotify' | 'bark' | 'notifyx' | 'apprise',
  params: NotificationDispatchParams
) {
  if (params.dedupEntries?.length) {
    for (const entry of params.dedupEntries) {
      await markNotificationSent(channel, buildDispatchParamsFromDedupEntries([entry]))
    }
    return
  }

  await markNotificationSent(channel, params)
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

function buildForgotPasswordTitle(locale: AppLocale) {
  return getMessage(locale, 'notifications.forgotPassword.title')
}

function buildForgotPasswordBody(payload: ForgotPasswordNotificationPayload, locale: AppLocale) {
  return [
    getMessage(locale, 'notifications.forgotPassword.username', { username: payload.username }),
    getMessage(locale, 'notifications.forgotPassword.code', { code: payload.code }),
    getMessage(locale, 'notifications.forgotPassword.expiresInMinutes', { minutes: payload.expiresInMinutes }),
    getMessage(locale, 'notifications.forgotPassword.ignoreHint')
  ].join('\n')
}

async function sendSmtpEmailWithConfig(message: DirectNotificationMessage, config: EmailConfigInput) {
  const { host, port, secure, username, password, from, to } = config
  if (!host || !port || !username || !password || !from || !to) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.emailDisabledOrIncomplete'))
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
    subject: message.title,
    text: message.text
  })
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
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.resendRequestFailed')}: HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }
}

async function sendEmailWithProvider(
  message: DirectNotificationMessage,
  provider: 'smtp' | 'resend',
  smtpConfig: EmailConfigInput,
  resendConfig: ResendConfigInput
) {
  if (provider === 'resend') {
    await sendResendEmailWithConfig(message, resendConfig)
    return
  }

  await sendSmtpEmailWithConfig(message, smtpConfig)
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

  await options.send(buildNotificationMessage(dispatchParams, locale))
  await markNotificationEntriesSent(options.channel, dispatchParams)

  return {
    channel: options.channel,
    status: 'success'
  }
}

async function sendEmailNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'email',
    enabled: settings.emailNotificationsEnabled,
    disabledMessage: 'email_disabled',
    alreadySentMessage: 'email_already_sent',
    send: (message) => sendEmailWithProvider(message, settings.emailProvider, settings.smtpConfig, settings.resendConfig)
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
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusRequestFailed')}: HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: PushplusApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as PushplusApiResponse) : null
  } catch {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusInvalidResponse')}: ${rawText || 'empty response'}`)
  }

  if (!parsed || parsed.code !== 200) {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.pushplusRejected')}: ${parsed?.msg || rawText || 'unknown error'}`)
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
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'pushplus',
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
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramRequestFailed')}: HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: TelegramApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as TelegramApiResponse) : null
  } catch {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramInvalidResponse')}: ${rawText || 'empty response'}`)
  }

  if (!parsed?.ok) {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.telegramRejected')}: ${parsed?.description || rawText || 'unknown error'}`)
  }
}

async function sendTelegramNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'telegram',
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
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanRequestFailed')}: HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: { code?: number; message?: string } | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as { code?: number; message?: string }) : null
  } catch {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanInvalidResponse')}: ${rawText || 'empty response'}`)
  }

  if (!parsed || parsed.code !== 0) {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.serverchanRejected')}: ${parsed?.message || rawText || 'unknown error'}`)
  }
}

async function sendServerchanNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'serverchan',
    enabled: settings.serverchanNotificationsEnabled,
    disabledMessage: 'serverchan_disabled',
    alreadySentMessage: 'serverchan_already_sent',
    send: (message) => sendServerchanWithConfig(message, settings.serverchanConfig)
  }, locale)
}

async function sendGotifyWithConfig(message: DirectNotificationMessage, config: GotifyConfigInput, locale: AppLocale = DEFAULT_APP_LOCALE) {
  const target = validateNotificationTargetUrl(config.url.trim(), {
    label: getMessage(locale, 'settings.labels.gotifyTargetUrl'),
    locale,
    allowPrivateHost: true
  })
  const token = config.token?.trim()
  if (!token) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.gotifyDisabledOrIncomplete'))
  }

  const isHttps = target.protocol === 'https:'
  const transport = isHttps ? https : http
  const payload = new URLSearchParams({
    title: message.title,
    message: message.text,
    priority: '5'
  }).toString()
  const requestUrl = new URL(`/message?token=${encodeURIComponent(token)}`, target.toString())

  return new Promise<void>((resolve, reject) => {
    const req = transport.request(
      requestUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload).toString()
        },
        ...(isHttps ? { agent: new https.Agent({ rejectUnauthorized: !config.ignoreSsl }) } : {})
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8')
          const statusCode = res.statusCode ?? 0
          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.gotifyRequestFailed')}: HTTP ${statusCode}${rawText ? ` ${rawText}` : ''}`.trim()
              )
            )
            return
          }
          resolve()
        })
      }
    )

    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function sendGotifyNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'gotify',
    enabled: settings.gotifyNotificationsEnabled,
    disabledMessage: 'gotify_disabled',
    alreadySentMessage: 'gotify_already_sent',
    send: (message) => sendGotifyWithConfig(message, settings.gotifyConfig, locale)
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

function isBarkCustomServerUrl(target: URL) {
  return target.pathname.replace(/\/+$/, '') !== ''
}

function buildBarkRequestTarget(
  serverUrl: string,
  deviceKey: string | undefined,
  locale: AppLocale = DEFAULT_APP_LOCALE
) {
  const target = validateNotificationTargetUrl(serverUrl.trim(), {
    label: getMessage(locale, 'settings.labels.barkServerUrl'),
    locale,
    allowPrivateHost: true
  })

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

  if (isBarkCustomServerUrl(target)) {
    target.hash = ''
    return {
      url: target,
      headers,
      includeDeviceKey: false
    }
  }

  if (!deviceKey?.trim()) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkDisabledOrIncomplete'))
  }

  target.pathname = '/push'
  target.search = ''
  target.hash = ''
  return {
    url: target,
    headers,
    includeDeviceKey: true
  }
}

async function sendBarkWithConfig(
  message: DirectNotificationMessage,
  config: BarkConfigInput,
  locale: AppLocale = DEFAULT_APP_LOCALE
) {
  const serverUrl = config.serverUrl?.trim()
  const deviceKey = config.deviceKey?.trim()
  if (!serverUrl) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkDisabledOrIncomplete'))
  }

  const requestTarget = buildBarkRequestTarget(serverUrl, deviceKey, locale)

  const response = await fetch(requestTarget.url, {
    method: 'POST',
    headers: requestTarget.headers,
    body: JSON.stringify({
      title: message.title,
      body: message.text,
      ...(requestTarget.includeDeviceKey ? { device_key: deviceKey } : {}),
      ...(config.isArchive ? { isArchive: 1 } : {})
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkRequestFailed')}: HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: BarkApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as BarkApiResponse) : null
  } catch {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkInvalidResponse')}: ${rawText || 'empty response'}`)
  }

  if (!parsed || parsed.code !== 200) {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.barkRejected')}: ${parsed?.message || rawText || 'unknown error'}`)
  }
}

async function sendBarkNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'bark',
    enabled: settings.barkNotificationsEnabled,
    disabledMessage: 'bark_disabled',
    alreadySentMessage: 'bark_already_sent',
    send: (message) => sendBarkWithConfig(message, settings.barkConfig, locale)
  }, locale)
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
      content: normalizeMarkdownNotificationText(message.text),
      description: buildNotifyxDescription(message.title),
      team: config.team?.trim() || undefined
    })
  })

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxRequestFailed')}: HTTP ${response.status}${rawText ? ` ${rawText}` : ''}`.trim()
    )
  }

  let parsed: NotifyxApiResponse | null = null
  try {
    parsed = rawText ? (JSON.parse(rawText) as NotifyxApiResponse) : null
  } catch {
    throw new Error(`${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxInvalidResponse')}: ${rawText || 'empty response'}`)
  }

  if (!parsed || parsed.status !== 'queued') {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.notifyxRejected')}: ${parsed?.message || rawText || 'unknown error'}`
    )
  }
}

async function sendNotifyxNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'notifyx',
    enabled: settings.notifyxNotificationsEnabled,
    disabledMessage: 'notifyx_disabled',
    alreadySentMessage: 'notifyx_already_sent',
    send: (message) => sendNotifyxWithConfig(message, settings.notifyxConfig)
  }, locale)
}

async function sendAppriseNotification(
  params: NotificationDispatchParams,
  locale: AppLocale
): Promise<NotificationChannelResult> {
  const settings = await getNotificationChannelSettings()
  return dispatchDirectChannelNotification(params, {
    channel: 'apprise',
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
  const locale = await resolveNotificationLocale(context.locale)

  try {
    const webhookResult = await dispatchWebhookEvent(params, { locale })
    results.push(webhookResult)
  } catch (error) {
    results.push({
      channel: 'webhook',
      status: 'failed',
      message: error instanceof Error ? error.message : 'webhook_dispatch_failed'
    })
  }

  const emailResult = (await Promise.resolve(sendEmailNotification(params, locale)).catch((error) => ({
    channel: 'email',
    status: 'failed',
    message: error instanceof Error ? error.message : 'email_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(emailResult)

  const pushplusResult = (await Promise.resolve(sendPushplusNotification(params, locale)).catch((error) => ({
    channel: 'pushplus',
    status: 'failed',
    message: error instanceof Error ? error.message : 'pushplus_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(pushplusResult)

  const telegramResult = (await Promise.resolve(sendTelegramNotification(params, locale)).catch((error) => ({
    channel: 'telegram',
    status: 'failed',
    message: error instanceof Error ? error.message : 'telegram_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(telegramResult)

  const serverchanResult = (await Promise.resolve(sendServerchanNotification(params, locale)).catch((error) => ({
    channel: 'serverchan',
    status: 'failed',
    message: error instanceof Error ? error.message : 'serverchan_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(serverchanResult)

  const gotifyResult = (await Promise.resolve(sendGotifyNotification(params, locale)).catch((error) => ({
    channel: 'gotify',
    status: 'failed',
    message: error instanceof Error ? error.message : 'gotify_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(gotifyResult)

  const barkResult = (await Promise.resolve(sendBarkNotification(params, locale)).catch((error) => ({
    channel: 'bark',
    status: 'failed',
    message: error instanceof Error ? error.message : 'bark_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(barkResult)

  const notifyxResult = (await Promise.resolve(sendNotifyxNotification(params, locale)).catch((error) => ({
    channel: 'notifyx',
    status: 'failed',
    message: error instanceof Error ? error.message : 'notifyx_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(notifyxResult)

  const appriseResult = (await Promise.resolve(sendAppriseNotification(params, locale)).catch((error) => ({
    channel: 'apprise',
    status: 'failed',
    message: error instanceof Error ? error.message : 'apprise_dispatch_failed'
  }))) as NotificationChannelResult
  results.push(appriseResult)

  logNotificationDispatch(params, results, locale)

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

async function buildTestReminderMessage(locale: AppLocale) {
  const timezone = await getAppTimezone()
  return buildNotificationMessage({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:notification',
    periodKey: `${toIsoDate(new Date(), timezone)}:upcoming`,
    payload: {
      ...buildTestReminderPayload(locale),
      nextRenewalDate: formatDateInTimezone(new Date(), timezone)
    }
  })
}

export async function sendTestEmailNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.emailNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.emailDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendEmailWithProvider(
    await buildTestReminderMessage(locale),
    settings.emailProvider,
    settings.smtpConfig,
    settings.resendConfig
  )
}

export async function sendForgotPasswordVerificationCode(
  payload: ForgotPasswordNotificationPayload,
  context: NotificationLocaleContext = {}
) {
  const settings = await getNotificationChannelSettings()
  const results: NotificationChannelResult[] = []
  const locale = await resolveNotificationLocale(context.locale)
  const message: DirectNotificationMessage = {
    title: buildForgotPasswordTitle(locale),
    text: buildForgotPasswordBody(payload, locale),
    html: `<pre>${buildForgotPasswordBody(payload, locale)}</pre>`
  }

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
      await sendGotifyWithConfig(message, settings.gotifyConfig, locale)
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
      await sendBarkWithConfig(message, settings.barkConfig, locale)
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
      await sendNotifyxWithConfig(message, settings.notifyxConfig)
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
      await sendAppriseWithConfig(message, settings.appriseConfig, {
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
  await sendEmailWithProvider(
    await buildTestReminderMessage(locale),
    config.emailProvider,
    config.smtpConfig,
    config.resendConfig
  )
}

export async function sendTestPushplusNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.pushplusNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.pushplusDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendPushplusWithConfig(await buildTestReminderMessage(locale), settings.pushplusConfig)

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
  return sendPushplusWithConfig(await buildTestReminderMessage(locale), config)
}

export async function sendTestTelegramNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.telegramNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.telegramDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendTelegramWithConfig(await buildTestReminderMessage(locale), settings.telegramConfig)

  return { success: true }
}

export async function sendTestTelegramNotificationWithConfig(
  config: TelegramConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  await sendTelegramWithConfig(await buildTestReminderMessage(locale), config)

  return { success: true }
}

export async function sendTestServerchanNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.serverchanNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.serverchanDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendServerchanWithConfig(await buildTestReminderMessage(locale), settings.serverchanConfig)

  return { success: true }
}

export async function sendTestServerchanNotificationWithConfig(
  config: ServerchanConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  await sendServerchanWithConfig(await buildTestReminderMessage(locale), config)

  return { success: true }
}

export async function sendTestGotifyNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.gotifyNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.gotifyDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendGotifyWithConfig(await buildTestReminderMessage(locale), settings.gotifyConfig, locale)

  return { success: true }
}

export async function sendTestGotifyNotificationWithConfig(
  config: GotifyConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  await sendGotifyWithConfig(await buildTestReminderMessage(locale), config, locale)

  return { success: true }
}

export async function sendTestBarkNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.barkNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.barkDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendBarkWithConfig(await buildTestReminderMessage(locale), settings.barkConfig, locale)

  return { success: true }
}

export async function sendTestBarkNotificationWithConfig(
  config: BarkConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  await sendBarkWithConfig(await buildTestReminderMessage(locale), config, locale)

  return { success: true }
}

export async function sendTestNotifyxNotification(context: NotificationLocaleContext = {}) {
  const settings = await getNotificationChannelSettings()
  if (!settings.notifyxNotificationsEnabled) {
    throw new Error(getMessage(await resolveNotificationLocale(context.locale), 'api.errors.notifications.notifyxDisabledOrIncomplete'))
  }

  const locale = await resolveNotificationLocale(context.locale)
  await sendNotifyxWithConfig(await buildTestReminderMessage(locale), settings.notifyxConfig)

  return { success: true }
}

export async function sendTestNotifyxNotificationWithConfig(
  config: NotifyxConfigInput,
  context: NotificationLocaleContext = {}
) {
  const locale = await resolveNotificationLocale(context.locale)
  await sendNotifyxWithConfig(await buildTestReminderMessage(locale), config)

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
  await sendAppriseWithConfig(await buildTestReminderMessage(locale), settings.appriseConfig, {
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
  const temporaryKey = createAppriseTemporaryKey(config.key)

  try {
    await syncAppriseConfig(config, {
      locale,
      keyOverride: temporaryKey
    })

    await sendAppriseWithConfig(await buildTestReminderMessage(locale), config, {
      locale,
      targetId: context.targetId,
      keyOverride: temporaryKey
    })

    return { success: true }
  } finally {
    await deleteAppriseConfig(config, temporaryKey, locale)
  }
}
