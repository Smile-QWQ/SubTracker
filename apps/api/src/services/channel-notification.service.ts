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

function buildNotificationKey(channel: 'email' | 'pushplus', params: NotificationDispatchParams) {
  return `notification:${channel}:${params.eventType}:${params.resourceKey}:${params.periodKey}`
}

async function hasNotificationBeenSent(channel: 'email' | 'pushplus', params: NotificationDispatchParams) {
  return getSetting<boolean>(buildNotificationKey(channel, params), false)
}

async function markNotificationSent(channel: 'email' | 'pushplus', params: NotificationDispatchParams) {
  await setSetting(buildNotificationKey(channel, params), true)
}

function buildNotificationTitle(params: NotificationDispatchParams) {
  switch (params.eventType) {
    case 'subscription.reminder_due':
      return `订阅即将续订：${String(params.payload.name ?? '')}`
    case 'subscription.overdue':
      return `订阅已过期：${String(params.payload.name ?? '')}`
    case 'subscription.renewed':
      return `订阅已续订：${String(params.payload.subscriptionId ?? params.payload.name ?? '')}`
    case 'exchange-rate.stale':
      return '汇率快照已过期'
    default:
      return 'SubTracker 通知'
  }
}

function buildNotificationBody(params: NotificationDispatchParams) {
  return [
    `事件：${params.eventType}`,
    `资源：${params.resourceKey}`,
    `周期：${params.periodKey}`,
    '',
    JSON.stringify(params.payload, null, 2)
  ].join('\n')
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

async function sendPushplusWithConfig(params: NotificationDispatchParams, config: PushPlusConfigInput) {
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

  if (!response.ok) {
    throw new Error(`PushPlus request failed with status ${response.status}`)
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

export async function sendTestEmailNotification() {
  const success = await sendEmailNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:email',
    periodKey: new Date().toISOString().slice(0, 10),
    payload: {
      name: '测试订阅',
      nextRenewalDate: new Date().toISOString()
    }
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
      periodKey: new Date().toISOString().slice(0, 10),
      payload: {
        name: '测试订阅',
        nextRenewalDate: new Date().toISOString()
      }
    },
    config
  )
}

export async function sendTestPushplusNotification() {
  const success = await sendPushplusNotification({
    eventType: 'subscription.reminder_due',
    resourceKey: 'test:pushplus',
    periodKey: new Date().toISOString().slice(0, 10),
    payload: {
      name: '测试订阅',
      nextRenewalDate: new Date().toISOString()
    }
  })

  if (!success) {
    throw new Error('PushPlus 通知未启用或配置不完整')
  }
}

export async function sendTestPushplusNotificationWithConfig(config: PushPlusConfigInput) {
  await sendPushplusWithConfig(
    {
      eventType: 'subscription.reminder_due',
      resourceKey: 'test:pushplus',
      periodKey: new Date().toISOString().slice(0, 10),
      payload: {
        name: '测试订阅',
        nextRenewalDate: new Date().toISOString()
      }
    },
    config
  )
}
