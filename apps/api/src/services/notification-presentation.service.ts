import dayjs from 'dayjs'
import { type WebhookEventType } from '@subtracker/shared'
import type {
  NotificationDispatchParams,
  NotificationEntryPayload,
  NotificationSummarySection
} from './notification-merge.service'

export type DirectNotificationMessage = {
  title: string
  text: string
  html?: string
}

type NotificationSinglePresentation = {
  mode: 'single'
  eventType: WebhookEventType
  phaseLabel: string
  subscription: NotificationEntryPayload
}

type NotificationMergedPresentation = {
  mode: 'merged'
  eventType: WebhookEventType
  phaseLabel: string
  sections: NotificationSummarySection[]
  subscriptions: NotificationEntryPayload[]
}

export type NotificationPresentation = NotificationSinglePresentation | NotificationMergedPresentation

function getMergedSubscriptions(params: NotificationDispatchParams) {
  const subscriptions = params.payload.subscriptions
  return Array.isArray(subscriptions) ? (subscriptions as NotificationEntryPayload[]) : []
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

function getPhaseLabelFromParams(params: NotificationDispatchParams) {
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

export function resolveNotificationPresentation(params: NotificationDispatchParams): NotificationPresentation {
  const mergedSubscriptions = getMergedSubscriptions(params)
  if (mergedSubscriptions.length === 0) {
    return {
      mode: 'single',
      eventType: params.eventType,
      phaseLabel: getPhaseLabelFromParams(params),
      subscription: params.payload as NotificationEntryPayload
    }
  }

  return {
    mode: 'merged',
    eventType: params.eventType,
    phaseLabel: getPhaseLabelFromParams(params),
    sections: getMergedSections(params),
    subscriptions: mergedSubscriptions
  }
}

function buildSingleNotificationTitle(presentation: NotificationSinglePresentation) {
  return `${presentation.phaseLabel}：${presentation.subscription.name || '未命名订阅'}`
}

function buildMergedNotificationTitle(presentation: NotificationMergedPresentation) {
  const prefix = presentation.sections.length > 1 ? '订阅提醒汇总' : presentation.phaseLabel
  return `${prefix}：共 ${presentation.subscriptions.length} 项订阅`
}

function buildSummarySectionBody(section: NotificationSummarySection) {
  return [
    `${section.title}（${section.subscriptions.length} 项）`,
    ...section.subscriptions.map((subscription, index) => {
      const amountText = `${subscription.amount} ${subscription.currency}`.trim()
      const extras = [
        subscription.daysUntilRenewal > 0 ? `还有 ${subscription.daysUntilRenewal} 天` : null,
        subscription.daysOverdue > 0 ? `过期 ${subscription.daysOverdue} 天` : null
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

function buildMergedNotificationBody(presentation: NotificationMergedPresentation) {
  if (presentation.sections.length > 0) {
    const lines = [
      `提醒类型：${presentation.phaseLabel}`,
      `订阅数量：${presentation.subscriptions.length} 项`,
      ''
    ]

    for (const section of presentation.sections) {
      lines.push(buildSummarySectionBody(section), '')
    }

    return lines.join('\n').trim()
  }

  return [
    `提醒类型：${presentation.phaseLabel}`,
    `订阅数量：${presentation.subscriptions.length} 项`,
    '',
    ...presentation.subscriptions.map((subscription, index) => {
      const amountText = `${subscription.amount} ${subscription.currency}`.trim()
      const extras = [
        subscription.daysUntilRenewal > 0 ? `还有 ${subscription.daysUntilRenewal} 天` : null,
        subscription.daysOverdue > 0 ? `过期 ${subscription.daysOverdue} 天` : null
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

function buildSingleNotificationBody(presentation: NotificationSinglePresentation) {
  const { subscription } = presentation
  const lines = [
    `提醒类型：${presentation.phaseLabel}`,
    `订阅名称：${String(subscription.name ?? '')}`,
    `下次续订：${formatNotificationDate(String(subscription.nextRenewalDate ?? ''))}`,
    `金额：${`${String(subscription.amount ?? '')} ${String(subscription.currency ?? '')}`.trim()}`,
    `标签：${Array.isArray(subscription.tagNames) ? subscription.tagNames.join('、') : ''}`,
    `网址：${String(subscription.websiteUrl ?? '')}`,
    `备注：${String(subscription.notes ?? '')}`
  ]

  return lines.filter((line) => !line.endsWith('：')).join('\n')
}

export function renderNotificationMessage(presentation: NotificationPresentation): DirectNotificationMessage {
  const title =
    presentation.mode === 'merged'
      ? buildMergedNotificationTitle(presentation)
      : buildSingleNotificationTitle(presentation)
  const text =
    presentation.mode === 'merged'
      ? buildMergedNotificationBody(presentation)
      : buildSingleNotificationBody(presentation)

  return {
    title,
    text,
    html: `<pre>${text}</pre>`
  }
}

export function buildNotificationMessage(params: NotificationDispatchParams): DirectNotificationMessage {
  return renderNotificationMessage(resolveNotificationPresentation(params))
}
