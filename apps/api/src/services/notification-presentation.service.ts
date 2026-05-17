import dayjs from 'dayjs'
import { getMessage, type AppLocale, type WebhookEventType } from '@subtracker/shared'
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

function getPhaseLabelFromParams(params: NotificationDispatchParams, locale: AppLocale) {
  const phase = String(params.payload.phase ?? '')
  const daysUntilRenewal = Number(params.payload.daysUntilRenewal ?? 0)
  const daysOverdue = Number(params.payload.daysOverdue ?? 0)
  const mergedSections = getMergedSections(params)
  const mergedSubscriptions = getMergedSubscriptions(params)

  if (mergedSections.length > 1) {
    return getMessage(locale, 'notifications.phases.summary')
  }

  if (params.eventType === 'subscription.reminder_due') {
    if (mergedSubscriptions.length > 0) {
      return phase === 'due_today'
        ? getMessage(locale, 'notifications.phases.dueToday')
        : getMessage(locale, 'notifications.phases.upcoming')
    }
    return phase === 'due_today'
      ? getMessage(locale, 'notifications.phases.dueToday')
      : getMessage(locale, 'notifications.phases.daysUntil', { days: daysUntilRenewal })
  }

  return mergedSubscriptions.length > 0
    ? getMessage(locale, 'notifications.phases.overdue')
    : getMessage(locale, 'notifications.phases.overdueDay', { days: daysOverdue })
}

export function resolveNotificationPresentation(params: NotificationDispatchParams, locale: AppLocale = 'zh-CN'): NotificationPresentation {
  const mergedSubscriptions = getMergedSubscriptions(params)
  if (mergedSubscriptions.length === 0) {
    return {
      mode: 'single',
      eventType: params.eventType,
      phaseLabel: getPhaseLabelFromParams(params, locale),
      subscription: params.payload as NotificationEntryPayload
    }
  }

  return {
    mode: 'merged',
    eventType: params.eventType,
    phaseLabel: getPhaseLabelFromParams(params, locale),
    sections: getMergedSections(params),
    subscriptions: mergedSubscriptions
  }
}

function buildSingleNotificationTitle(presentation: NotificationSinglePresentation, locale: AppLocale) {
  return getMessage(locale, 'notifications.titles.single', {
    phase: presentation.phaseLabel,
    name: presentation.subscription.name || getMessage(locale, 'notifications.presentation.unnamedSubscription')
  })
}

function buildMergedNotificationTitle(presentation: NotificationMergedPresentation, locale: AppLocale) {
  const prefix = presentation.sections.length > 1 ? getMessage(locale, 'notifications.phases.summary') : presentation.phaseLabel
  return getMessage(locale, 'notifications.presentation.mergedTitle', {
    prefix,
    count: presentation.subscriptions.length
  })
}

function buildSummarySectionBody(section: NotificationSummarySection, locale: AppLocale) {
  return [
    getMessage(locale, 'notifications.presentation.sectionTitle', {
      title: section.title,
      count: section.subscriptions.length
    }),
    ...section.subscriptions.map((subscription, index) => {
      const amountText = `${subscription.amount} ${subscription.currency}`.trim()
      const extras = [
        subscription.daysUntilRenewal > 0 ? getMessage(locale, 'notifications.presentation.daysUntil', { days: subscription.daysUntilRenewal }) : null,
        subscription.daysOverdue > 0 ? getMessage(locale, 'notifications.presentation.overdueDays', { days: subscription.daysOverdue }) : null
      ]
        .filter(Boolean)
        .join(' / ')

      return [
        `${index + 1}. ${subscription.name}`,
        `   ${getMessage(locale, 'notifications.labels.date', { value: formatNotificationDate(subscription.nextRenewalDate) })}`,
        `   ${getMessage(locale, 'notifications.labels.amount', { value: amountText })}`,
        extras ? `   ${getMessage(locale, 'notifications.labels.details', { value: extras })}` : null
      ]
        .filter(Boolean)
        .join('\n')
    })
  ].join('\n')
}

function buildMergedNotificationBody(presentation: NotificationMergedPresentation, locale: AppLocale) {
  if (presentation.sections.length > 0) {
    const lines = [
      getMessage(locale, 'notifications.labels.reminderType', { value: presentation.phaseLabel }),
      getMessage(locale, 'notifications.labels.subscriptionCount', { count: presentation.subscriptions.length }),
      ''
    ]

    for (const section of presentation.sections) {
      lines.push(buildSummarySectionBody(section, locale), '')
    }

    return lines.join('\n').trim()
  }

  return [
    getMessage(locale, 'notifications.labels.reminderType', { value: presentation.phaseLabel }),
    getMessage(locale, 'notifications.labels.subscriptionCount', { count: presentation.subscriptions.length }),
    '',
    ...presentation.subscriptions.map((subscription, index) => {
      const amountText = `${subscription.amount} ${subscription.currency}`.trim()
      const extras = [
        subscription.daysUntilRenewal > 0 ? getMessage(locale, 'notifications.presentation.daysUntil', { days: subscription.daysUntilRenewal }) : null,
        subscription.daysOverdue > 0 ? getMessage(locale, 'notifications.presentation.overdueDays', { days: subscription.daysOverdue }) : null
      ]
        .filter(Boolean)
        .join(' / ')

      return [
        `${index + 1}. ${subscription.name}`,
        `   ${getMessage(locale, 'notifications.labels.date', { value: formatNotificationDate(subscription.nextRenewalDate) })}`,
        `   ${getMessage(locale, 'notifications.labels.amount', { value: amountText })}`,
        extras ? `   ${getMessage(locale, 'notifications.labels.details', { value: extras })}` : null
      ]
        .filter(Boolean)
        .join('\n')
    })
  ].join('\n')
}

function buildSingleNotificationBody(presentation: NotificationSinglePresentation, locale: AppLocale) {
  const { subscription } = presentation
  const lines = [
    getMessage(locale, 'notifications.labels.reminderType', { value: presentation.phaseLabel }),
    getMessage(locale, 'notifications.presentation.subscriptionName', { name: String(subscription.name ?? '') }),
    getMessage(locale, 'notifications.presentation.nextRenewal', { value: formatNotificationDate(String(subscription.nextRenewalDate ?? '')) }),
    getMessage(locale, 'notifications.presentation.amount', { value: `${`${String(subscription.amount ?? '')} ${String(subscription.currency ?? '')}`.trim()}` }),
    getMessage(locale, 'notifications.presentation.tags', { value: Array.isArray(subscription.tagNames) ? subscription.tagNames.join(getMessage(locale, 'common.separators.list')) : '' }),
    getMessage(locale, 'notifications.presentation.website', { value: String(subscription.websiteUrl ?? '') }),
    getMessage(locale, 'notifications.presentation.notes', { value: String(subscription.notes ?? '') })
  ]

  return lines.filter((line) => !line.endsWith(': ') && !line.endsWith('：')).join('\n')
}

export function renderNotificationMessage(presentation: NotificationPresentation, locale: AppLocale = 'zh-CN'): DirectNotificationMessage {
  const title =
    presentation.mode === 'merged'
      ? buildMergedNotificationTitle(presentation, locale)
      : buildSingleNotificationTitle(presentation, locale)
  const text =
    presentation.mode === 'merged'
      ? buildMergedNotificationBody(presentation, locale)
      : buildSingleNotificationBody(presentation, locale)

  return {
    title,
    text,
    html: `<pre>${text}</pre>`
  }
}

export function buildNotificationMessage(params: NotificationDispatchParams, locale: AppLocale = 'zh-CN'): DirectNotificationMessage {
  return renderNotificationMessage(resolveNotificationPresentation(params, locale), locale)
}
