import dayjs from 'dayjs'
import {
  applyNotificationTemplate,
  createEmptyNotificationTemplateConfig,
  getDefaultNotificationTemplate,
  resolveNotificationTemplateConfig,
  type AppLocale,
  type NotificationTemplateConfigInput,
  type NotificationTemplateGroup,
  type WebhookEventType,
  getMessage
} from '@subtracker/shared'
import type {
  NotificationDispatchParams,
  NotificationEntryPayload,
  NotificationSummarySection
} from './notification-merge.service'

export type DirectNotificationMessage = {
  title: string
  text: string
  markdown?: string
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

function buildForgotPasswordNotificationTitle(locale: AppLocale) {
  return getMessage(locale, 'notifications.forgotPassword.title')
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

type NotificationTemplateRenderOptions = {
  group?: NotificationTemplateGroup
  templateConfig?: NotificationTemplateConfigInput | null
}

type ForgotPasswordTemplatePayload = {
  username: string
  code: string
  expiresInMinutes: number
}

function escapeMarkdownValue(value: string) {
  return String(value ?? '').replace(/([\\`*_{}\[\]()#+\-.!>|])/g, '\\$1')
}

function escapeHtml(value: string) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeTelegramMarkdownV2Text(value: string) {
  return String(value ?? '').replace(/([\\_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

function escapeTelegramMarkdownV2Code(value: string) {
  return String(value ?? '').replace(/([\\`])/g, '\\$1')
}

function escapeTelegramMarkdownV2LinkUrl(value: string) {
  return String(value ?? '').replace(/([\\)])/g, '\\$1')
}

function unescapeTelegramMarkdownSource(value: string) {
  return String(value ?? '').replace(/\\([\\`*_{}\[\]()#+\-.!>|~=])/g, '$1')
}

function buildTelegramMarkdownLiteralToken(index: number) {
  return `\uE000${index}\uE001`
}

function buildTelegramMarkdownInlineToken(index: number) {
  return `\uE100${index}\uE101`
}

function buildTelegramCodeBlockToken(index: number) {
  return `\uE200${index}\uE201`
}

function preserveTelegramMarkdownEscapes(value: string) {
  const literals: string[] = []
  const text = String(value ?? '').replace(/\\([\\`*_{}\[\]()#+\-.!>|~=])/g, (_match, escaped) => {
    const token = buildTelegramMarkdownLiteralToken(literals.length)
    literals.push(`\\${String(escaped)}`)
    return token
  })

  return {
    text,
    restore(input: string) {
      return input.replace(/\uE000(\d+)\uE001/g, (_match, rawIndex) => literals[Number(rawIndex)] ?? '')
    }
  }
}

function stripHtml(value: string) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeMarkdownLines(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join('\n').trim()
}

function buildDetailsDescriptionText(subscription: NotificationEntryPayload, locale: AppLocale) {
  return [
    subscription.daysUntilRenewal > 0
      ? getMessage(locale, 'notifications.presentation.daysUntil', { days: subscription.daysUntilRenewal })
      : null,
    subscription.daysOverdue > 0
      ? getMessage(locale, 'notifications.presentation.overdueDays', { days: subscription.daysOverdue })
      : null
  ]
    .filter(Boolean)
    .join(' / ')
}

function buildTextSingleDetailsBlock(presentation: NotificationSinglePresentation, locale: AppLocale) {
  return buildSingleNotificationBody(presentation, locale)
}

function buildMarkdownSingleDetailsBlock(presentation: NotificationSinglePresentation, locale: AppLocale) {
  const subscription = presentation.subscription
  const amountText = `${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()
  const detailsText = buildDetailsDescriptionText(subscription, locale)
  const lines = [
    `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.name'))}**：${escapeMarkdownValue(String(subscription.name ?? ''))}`,
    `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.nextRenewal'))}**：${escapeMarkdownValue(formatNotificationDate(String(subscription.nextRenewalDate ?? '')))}`,
    `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.amount'))}**：${escapeMarkdownValue(amountText)}`,
    Array.isArray(subscription.tagNames) && subscription.tagNames.length
      ? `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.tags'))}**：${escapeMarkdownValue(subscription.tagNames.join(getMessage(locale, 'common.separators.list')))}`
      : null,
    subscription.websiteUrl
      ? `- **${escapeMarkdownValue(getMessage(locale, 'notifications.labels.website', { value: '' }).replace(/[:：]\s*$/, ''))}**：${escapeMarkdownValue(String(subscription.websiteUrl))}`
      : null,
    subscription.notes
      ? `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.notes'))}**：${escapeMarkdownValue(String(subscription.notes))}`
      : null,
    detailsText
      ? `- **${escapeMarkdownValue(getMessage(locale, 'notifications.labels.details', { value: '' }).replace(/[:：]\s*$/, ''))}**：${escapeMarkdownValue(detailsText)}`
      : null
  ]

  return normalizeMarkdownLines(lines)
}

function buildHtmlSingleDetailsBlock(presentation: NotificationSinglePresentation, locale: AppLocale) {
  const subscription = presentation.subscription
  const amountText = `${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()
  const detailsText = buildDetailsDescriptionText(subscription, locale)
  const items = [
    `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.name'))}</strong>：${escapeHtml(String(subscription.name ?? ''))}</li>`,
    `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.nextRenewal'))}</strong>：${escapeHtml(formatNotificationDate(String(subscription.nextRenewalDate ?? '')))}</li>`,
    `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.amount'))}</strong>：${escapeHtml(amountText)}</li>`,
    Array.isArray(subscription.tagNames) && subscription.tagNames.length
      ? `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.tags'))}</strong>：${escapeHtml(subscription.tagNames.join(getMessage(locale, 'common.separators.list')))}</li>`
      : null,
    subscription.websiteUrl
      ? `<li><strong>${escapeHtml(getMessage(locale, 'notifications.labels.website', { value: '' }).replace(/[:：]\s*$/, ''))}</strong>：<a href="${escapeHtml(String(subscription.websiteUrl))}">${escapeHtml(String(subscription.websiteUrl))}</a></li>`
      : null,
    subscription.notes
      ? `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.notes'))}</strong>：${escapeHtml(String(subscription.notes))}</li>`
      : null,
    detailsText
      ? `<li><strong>${escapeHtml(getMessage(locale, 'notifications.labels.details', { value: '' }).replace(/[:：]\s*$/, ''))}</strong>：${escapeHtml(detailsText)}</li>`
      : null
  ]
    .filter(Boolean)
    .join('')

  return `<ul>${items}</ul>`
}

function buildMarkdownMergedSectionsBlock(presentation: NotificationMergedPresentation, locale: AppLocale) {
  const blocks = presentation.sections.length > 0
    ? presentation.sections.map((section) => {
        const entries = section.subscriptions.map((subscription, index) => {
          const amountText = `${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()
          const detailsText = buildDetailsDescriptionText(subscription, locale)
          return normalizeMarkdownLines([
            `${index + 1}. **${escapeMarkdownValue(String(subscription.name ?? ''))}**`,
            `   - ${escapeMarkdownValue(getMessage(locale, 'common.labels.nextRenewal'))}：${escapeMarkdownValue(formatNotificationDate(String(subscription.nextRenewalDate ?? '')))}`,
            `   - ${escapeMarkdownValue(getMessage(locale, 'common.labels.amount'))}：${escapeMarkdownValue(amountText)}`,
            detailsText ? `   - ${escapeMarkdownValue(getMessage(locale, 'notifications.labels.details', { value: '' }).replace(/[:：]\s*$/, ''))}：${escapeMarkdownValue(detailsText)}` : null
          ])
        })
        return `### ${escapeMarkdownValue(section.title)}\n\n${entries.join('\n\n')}`.trim()
      })
    : presentation.subscriptions.map((subscription, index) => {
        const amountText = `${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()
        return normalizeMarkdownLines([
          `${index + 1}. **${escapeMarkdownValue(String(subscription.name ?? ''))}**`,
          `   - ${escapeMarkdownValue(getMessage(locale, 'common.labels.nextRenewal'))}：${escapeMarkdownValue(formatNotificationDate(String(subscription.nextRenewalDate ?? '')))}`,
          `   - ${escapeMarkdownValue(getMessage(locale, 'common.labels.amount'))}：${escapeMarkdownValue(amountText)}`
        ])
      })

  return blocks.join('\n\n').trim()
}

function buildHtmlMergedSectionsBlock(presentation: NotificationMergedPresentation, locale: AppLocale) {
  const sections = presentation.sections.length > 0
    ? presentation.sections
    : [{
        phase: presentation.phaseLabel,
        title: presentation.phaseLabel,
        eventType: presentation.eventType,
        subscriptions: presentation.subscriptions
      }]

  return sections.map((section) => {
    const items = section.subscriptions.map((subscription) => {
      const amountText = `${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()
      const detailsText = buildDetailsDescriptionText(subscription, locale)
      return [
        '<li>',
        `<strong>${escapeHtml(String(subscription.name ?? ''))}</strong>`,
        `<div>${escapeHtml(getMessage(locale, 'common.labels.nextRenewal'))}：${escapeHtml(formatNotificationDate(String(subscription.nextRenewalDate ?? '')))}</div>`,
        `<div>${escapeHtml(getMessage(locale, 'common.labels.amount'))}：${escapeHtml(amountText)}</div>`,
        detailsText ? `<div>${escapeHtml(getMessage(locale, 'notifications.labels.details', { value: '' }).replace(/[:：]\s*$/, ''))}：${escapeHtml(detailsText)}</div>` : '',
        '</li>'
      ].join('')
    }).join('')

    return `<section><h3>${escapeHtml(section.title)}</h3><ol>${items}</ol></section>`
  }).join('')
}

function buildTextMergedSummaryBlock(presentation: NotificationMergedPresentation, locale: AppLocale) {
  return [
    getMessage(locale, 'notifications.labels.reminderType', { value: presentation.phaseLabel }),
    getMessage(locale, 'notifications.labels.subscriptionCount', { count: presentation.subscriptions.length })
  ].join('\n')
}

function buildMarkdownMergedSummaryBlock(presentation: NotificationMergedPresentation, locale: AppLocale) {
  return normalizeMarkdownLines([
    `> ${escapeMarkdownValue(getMessage(locale, 'notifications.labels.reminderType', { value: presentation.phaseLabel }))}`,
    `> ${escapeMarkdownValue(getMessage(locale, 'notifications.labels.subscriptionCount', { count: presentation.subscriptions.length }))}`
  ])
}

function buildHtmlMergedSummaryBlock(presentation: NotificationMergedPresentation, locale: AppLocale) {
  return [
    '<div class="subtracker-notification__summary">',
    `<p>${escapeHtml(getMessage(locale, 'notifications.labels.reminderType', { value: presentation.phaseLabel }))}</p>`,
    `<p>${escapeHtml(getMessage(locale, 'notifications.labels.subscriptionCount', { count: presentation.subscriptions.length }))}</p>`,
    '</div>'
  ].join('')
}

function buildForgotPasswordTextBlock(payload: ForgotPasswordTemplatePayload, locale: AppLocale) {
  return [
    getMessage(locale, 'notifications.forgotPassword.username', { username: payload.username }),
    getMessage(locale, 'notifications.forgotPassword.code', { code: payload.code }),
    getMessage(locale, 'notifications.forgotPassword.expiresInMinutes', { minutes: payload.expiresInMinutes }),
    getMessage(locale, 'notifications.forgotPassword.ignoreHint')
  ].join('\n')
}

function buildForgotPasswordMarkdownBlock(payload: ForgotPasswordTemplatePayload, locale: AppLocale) {
  return normalizeMarkdownLines([
    `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.username'))}**：${escapeMarkdownValue(payload.username)}`,
    `- **${escapeMarkdownValue(getMessage(locale, 'common.labels.code'))}**：${escapeMarkdownValue(payload.code)}`,
    `- **${escapeMarkdownValue(getMessage(locale, 'notifications.forgotPassword.expiresInMinutes', { minutes: payload.expiresInMinutes }).replace(/^[^:：]+[:：]\s*/, ''))}**`,
    '',
    escapeMarkdownValue(getMessage(locale, 'notifications.forgotPassword.ignoreHint'))
  ])
}

function buildForgotPasswordHtmlBlock(payload: ForgotPasswordTemplatePayload, locale: AppLocale) {
  return [
    '<ul>',
    `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.username'))}</strong>：${escapeHtml(payload.username)}</li>`,
    `<li><strong>${escapeHtml(getMessage(locale, 'common.labels.code'))}</strong>：${escapeHtml(payload.code)}</li>`,
    `<li>${escapeHtml(getMessage(locale, 'notifications.forgotPassword.expiresInMinutes', { minutes: payload.expiresInMinutes }))}</li>`,
    '</ul>',
    `<p>${escapeHtml(getMessage(locale, 'notifications.forgotPassword.ignoreHint'))}</p>`
  ].join('')
}

function buildTestIntroBlock(group: NotificationTemplateGroup, locale: AppLocale) {
  const text = getMessage(locale, 'notifications.tests.intro')
  if (group === 'html') {
    return `<p>${escapeHtml(text)}</p>`
  }
  return group === 'markdown' ? `> ${escapeMarkdownValue(text)}` : text
}

function getEffectiveTemplate(group: NotificationTemplateGroup, scene: 'singleReminder' | 'mergedReminder' | 'testNotification' | 'forgotPassword', locale: AppLocale, templateConfig?: NotificationTemplateConfigInput | null) {
  const resolved = resolveNotificationTemplateConfig(templateConfig ?? createEmptyNotificationTemplateConfig(), locale)
  return resolved[group][scene] ?? getDefaultNotificationTemplate(group, scene, locale)
}

function toGroupText(group: NotificationTemplateGroup, body: string) {
  if (group === 'html') return stripHtml(body)
  return body
}

function renderTelegramMarkdownV2PlainText(value: string) {
  const preserved = preserveTelegramMarkdownEscapes(value)
  return preserved.restore(escapeTelegramMarkdownV2Text(preserved.text))
}

function renderTelegramMarkdownV2Inline(value: string) {
  const placeholders: string[] = []
  const addPlaceholder = (rendered: string) => {
    const token = buildTelegramMarkdownInlineToken(placeholders.length)
    placeholders.push(rendered)
    return token
  }
  let text = String(value ?? '')

  text = text.replace(/`([^`\n]+)`/g, (_match, code) => addPlaceholder(`\`${escapeTelegramMarkdownV2Code(code)}\``))
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) =>
    addPlaceholder(`[${renderTelegramMarkdownV2PlainText(label)}](${escapeTelegramMarkdownV2LinkUrl(unescapeTelegramMarkdownSource(url))})`)
  )
  text = text.replace(/https?:\/\/(?:\\.|[^\s<>"')\]])+/g, (rawUrl) => {
    const normalizedUrl = unescapeTelegramMarkdownSource(rawUrl)
    return addPlaceholder(`[${renderTelegramMarkdownV2PlainText(normalizedUrl)}](${escapeTelegramMarkdownV2LinkUrl(normalizedUrl)})`)
  })
  text = text.replace(/\|\|(.+?)\|\|/g, (_match, inner) => addPlaceholder(`||${renderTelegramMarkdownV2PlainText(inner)}||`))
  text = text.replace(/~~(.+?)~~/g, (_match, inner) => addPlaceholder(`~${renderTelegramMarkdownV2PlainText(inner)}~`))
  text = text.replace(/\*\*(.+?)\*\*/g, (_match, inner) => addPlaceholder(`*${renderTelegramMarkdownV2PlainText(inner)}*`))
  text = text.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, (_match, prefix, inner) =>
    `${prefix}${addPlaceholder(`_${renderTelegramMarkdownV2PlainText(inner)}_`)}`
  )

  const preserved = preserveTelegramMarkdownEscapes(text)

  return preserved
    .restore(escapeTelegramMarkdownV2Text(preserved.text))
    .replace(/\uE100(\d+)\uE101/g, (_match, rawIndex) => placeholders[Number(rawIndex)] ?? '')
}

/**
 * 将当前仓库复用的“共享 markdown 模板”压缩到 Telegram MarkdownV2 的安全子集。
 *
 * 设计边界：
 * - 只覆盖通知模板真实会用到的结构，不追求完整 CommonMark / GFM 兼容。
 * - 保留并转换：blockquote、**bold**、*italic*、~~strike~~、||spoiler||、
 *   inline code、fenced code block、markdown link、裸 URL、标题/列表降级。
 * - 裸 URL 会被包装成 [display](rawUrl)，以降低 Telegram 对已转义 URL 的点击兼容问题。
 * - 先保护 code/link/已转义字面量，再 escape 普通文本，避免二次转义。
 *
 * 非目标：
 * - 任意复杂嵌套 markdown
 * - 完整 HTML/表格/任意扩展语法保真
 * - 把通知模板当作通用 Markdown 编辑器内容处理
 */
export function buildTelegramMarkdownV2FromMarkdown(markdown: string) {
  const telegramBlocks: string[] = []
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n')
  const codeBlockReplaced = normalized.replace(/```([A-Za-z0-9_+-]+)?\n?([\s\S]*?)```/g, (_match, language, code) => {
    const token = buildTelegramCodeBlockToken(telegramBlocks.length)
    const escapedCode = escapeTelegramMarkdownV2Code(String(code).replace(/^\n+|\n+$/g, ''))
    telegramBlocks.push(
      language
        ? `\`\`\`${String(language)}\n${escapedCode}\n\`\`\``
        : `\`\`\`\n${escapedCode}\n\`\`\``
    )
    return token
  })

  const renderedLines: string[] = []
  const lines = codeBlockReplaced.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\uE200\d+\uE201$/.test(line)) {
      renderedLines.push(line.replace(/\uE200(\d+)\uE201/g, (_match, rawIndex) => telegramBlocks[Number(rawIndex)] ?? ''))
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        const quoteContent = renderTelegramMarkdownV2Inline(lines[index].replace(/^>\s?/, ''))
        quoteLines.push(quoteContent ? `> ${quoteContent}` : '>')
        index += 1
      }
      renderedLines.push(quoteLines.join('\n'))
      index -= 1
      continue
    }

    if (/^#{1,6}\s+/.test(line)) {
      renderedLines.push(`*${renderTelegramMarkdownV2PlainText(line.replace(/^#{1,6}\s+/, ''))}*`)
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      renderedLines.push(`• ${renderTelegramMarkdownV2Inline(line.replace(/^\s*[-*]\s+/, ''))}`)
      continue
    }

    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/)
    if (orderedMatch) {
      renderedLines.push(`${orderedMatch[1]}\\. ${renderTelegramMarkdownV2Inline(orderedMatch[2])}`)
      continue
    }

    renderedLines.push(renderTelegramMarkdownV2Inline(line))
  }

  return renderedLines
    .join('\n')
    .trim()
}

function createSingleTemplateValues(
  presentation: NotificationSinglePresentation,
  locale: AppLocale,
  group: NotificationTemplateGroup
) {
  const subscription = presentation.subscription
  const values =
    group === 'html'
      ? {
          appName: 'SubTracker',
          phaseLabel: escapeHtml(presentation.phaseLabel),
          subscriptionCount: '1',
          'subscription.name': escapeHtml(String(subscription.name ?? '')),
          'subscription.nextRenewalDate': escapeHtml(formatNotificationDate(String(subscription.nextRenewalDate ?? ''))),
          'subscription.amount': escapeHtml(String(subscription.amount ?? '')),
          'subscription.currency': escapeHtml(String(subscription.currency ?? '')),
          'subscription.amountWithCurrency': escapeHtml(`${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()),
          'subscription.tags': escapeHtml(Array.isArray(subscription.tagNames) ? subscription.tagNames.join(getMessage(locale, 'common.separators.list')) : ''),
          'subscription.websiteUrl': escapeHtml(String(subscription.websiteUrl ?? '')),
          'subscription.notes': escapeHtml(String(subscription.notes ?? '')),
          'subscription.daysUntilRenewal': escapeHtml(String(subscription.daysUntilRenewal ?? 0)),
          'subscription.daysOverdue': escapeHtml(String(subscription.daysOverdue ?? 0)),
          detailsBlock: buildHtmlSingleDetailsBlock(presentation, locale),
          summaryBlock: '',
          sectionsBlock: '',
          forgotPasswordBlock: '',
          testIntroBlock: buildTestIntroBlock(group, locale)
        }
      : group === 'markdown'
        ? {
            appName: 'SubTracker',
            phaseLabel: escapeMarkdownValue(presentation.phaseLabel),
            subscriptionCount: '1',
            'subscription.name': escapeMarkdownValue(String(subscription.name ?? '')),
            'subscription.nextRenewalDate': escapeMarkdownValue(formatNotificationDate(String(subscription.nextRenewalDate ?? ''))),
            'subscription.amount': escapeMarkdownValue(String(subscription.amount ?? '')),
            'subscription.currency': escapeMarkdownValue(String(subscription.currency ?? '')),
            'subscription.amountWithCurrency': escapeMarkdownValue(`${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim()),
            'subscription.tags': escapeMarkdownValue(Array.isArray(subscription.tagNames) ? subscription.tagNames.join(getMessage(locale, 'common.separators.list')) : ''),
            'subscription.websiteUrl': escapeMarkdownValue(String(subscription.websiteUrl ?? '')),
            'subscription.notes': escapeMarkdownValue(String(subscription.notes ?? '')),
            'subscription.daysUntilRenewal': escapeMarkdownValue(String(subscription.daysUntilRenewal ?? 0)),
            'subscription.daysOverdue': escapeMarkdownValue(String(subscription.daysOverdue ?? 0)),
            detailsBlock: buildMarkdownSingleDetailsBlock(presentation, locale),
            summaryBlock: '',
            sectionsBlock: '',
            forgotPasswordBlock: '',
            testIntroBlock: buildTestIntroBlock(group, locale)
          }
        : {
            appName: 'SubTracker',
            phaseLabel: presentation.phaseLabel,
            subscriptionCount: '1',
            'subscription.name': String(subscription.name ?? ''),
            'subscription.nextRenewalDate': formatNotificationDate(String(subscription.nextRenewalDate ?? '')),
            'subscription.amount': String(subscription.amount ?? ''),
            'subscription.currency': String(subscription.currency ?? ''),
            'subscription.amountWithCurrency': `${subscription.amount ?? ''} ${subscription.currency ?? ''}`.trim(),
            'subscription.tags': Array.isArray(subscription.tagNames) ? subscription.tagNames.join(getMessage(locale, 'common.separators.list')) : '',
            'subscription.websiteUrl': String(subscription.websiteUrl ?? ''),
            'subscription.notes': String(subscription.notes ?? ''),
            'subscription.daysUntilRenewal': String(subscription.daysUntilRenewal ?? 0),
            'subscription.daysOverdue': String(subscription.daysOverdue ?? 0),
            detailsBlock: buildTextSingleDetailsBlock(presentation, locale),
            summaryBlock: '',
            sectionsBlock: '',
            forgotPasswordBlock: '',
            testIntroBlock: buildTestIntroBlock(group, locale)
          }

  return values
}

function createMergedTemplateValues(
  presentation: NotificationMergedPresentation,
  locale: AppLocale,
  group: NotificationTemplateGroup
) {
  const summaryBlock =
    group === 'html'
      ? buildHtmlMergedSummaryBlock(presentation, locale)
      : group === 'markdown'
        ? buildMarkdownMergedSummaryBlock(presentation, locale)
        : buildTextMergedSummaryBlock(presentation, locale)
  const sectionsBlock =
    group === 'html'
      ? buildHtmlMergedSectionsBlock(presentation, locale)
      : group === 'markdown'
        ? buildMarkdownMergedSectionsBlock(presentation, locale)
        : buildMergedNotificationBody(presentation, locale).replace(`${buildTextMergedSummaryBlock(presentation, locale)}\n\n`, '')

  const count = String(presentation.subscriptions.length)
  const escapeValue = group === 'html' ? escapeHtml : group === 'markdown' ? escapeMarkdownValue : (value: string) => value

  return {
    appName: 'SubTracker',
    phaseLabel: escapeValue(presentation.phaseLabel),
    subscriptionCount: count,
    detailsBlock: '',
    summaryBlock,
    sectionsBlock,
    forgotPasswordBlock: '',
    testIntroBlock: '',
    'subscription.name': '',
    'subscription.nextRenewalDate': '',
    'subscription.amount': '',
    'subscription.currency': '',
    'subscription.amountWithCurrency': '',
    'subscription.tags': '',
    'subscription.websiteUrl': '',
    'subscription.notes': '',
    'subscription.daysUntilRenewal': '',
    'subscription.daysOverdue': ''
  }
}

export function renderNotificationMessage(
  presentation: NotificationPresentation,
  locale: AppLocale = 'zh-CN',
  options: NotificationTemplateRenderOptions = {}
): DirectNotificationMessage {
  const group = options.group ?? 'text'
  const scene =
    presentation.mode === 'merged'
      ? 'mergedReminder'
      : 'singleReminder'
  const template = getEffectiveTemplate(group, scene, locale, options.templateConfig)
  const title =
    presentation.mode === 'merged'
      ? buildMergedNotificationTitle(presentation, locale)
      : buildSingleNotificationTitle(presentation, locale)
  const values =
    presentation.mode === 'merged'
      ? createMergedTemplateValues(presentation, locale, group)
      : createSingleTemplateValues(presentation, locale, group)

  const renderedTitle = applyNotificationTemplate(template.titleTemplate, {
    ...values,
    title: group === 'html' ? escapeHtml(title) : group === 'markdown' ? escapeMarkdownValue(title) : title
  })
  const renderedBody = applyNotificationTemplate(template.bodyTemplate, {
    ...values,
    title: renderedTitle
  })
  const plainTextBody =
    presentation.mode === 'merged'
      ? buildMergedNotificationBody(presentation, locale)
      : buildSingleNotificationBody(presentation, locale)

  return {
    title: toGroupText(group, renderedTitle),
    text: group === 'html' ? plainTextBody : toGroupText(group, renderedBody),
    markdown: group === 'markdown' ? renderedBody : undefined,
    html: group === 'html' ? renderedBody : undefined
  }
}

export function buildNotificationMessage(
  params: NotificationDispatchParams,
  locale: AppLocale = 'zh-CN',
  options: NotificationTemplateRenderOptions = {}
): DirectNotificationMessage {
  return renderNotificationMessage(resolveNotificationPresentation(params, locale), locale, options)
}

export function buildForgotPasswordNotificationMessage(
  payload: ForgotPasswordTemplatePayload,
  locale: AppLocale = 'zh-CN',
  options: NotificationTemplateRenderOptions = {}
): DirectNotificationMessage {
  const group = options.group ?? 'text'
  const template = getEffectiveTemplate(group, 'forgotPassword', locale, options.templateConfig)
  const title = buildForgotPasswordNotificationTitle(locale)
  const values =
    group === 'html'
      ? {
          appName: 'SubTracker',
          username: escapeHtml(payload.username),
          code: escapeHtml(payload.code),
          expiresInMinutes: escapeHtml(String(payload.expiresInMinutes)),
          forgotPasswordBlock: buildForgotPasswordHtmlBlock(payload, locale)
        }
      : group === 'markdown'
        ? {
            appName: 'SubTracker',
            username: escapeMarkdownValue(payload.username),
            code: escapeMarkdownValue(payload.code),
            expiresInMinutes: escapeMarkdownValue(String(payload.expiresInMinutes)),
            forgotPasswordBlock: buildForgotPasswordMarkdownBlock(payload, locale)
          }
        : {
            appName: 'SubTracker',
            username: payload.username,
            code: payload.code,
            expiresInMinutes: String(payload.expiresInMinutes),
            forgotPasswordBlock: buildForgotPasswordTextBlock(payload, locale)
          }

  const renderedTitle = applyNotificationTemplate(template.titleTemplate, {
    ...values,
    title: group === 'html' ? escapeHtml(title) : group === 'markdown' ? escapeMarkdownValue(title) : title
  })
  const renderedBody = applyNotificationTemplate(template.bodyTemplate, {
    ...values,
    title: renderedTitle
  })
  const plainTextBody = buildForgotPasswordTextBlock(payload, locale)

  return {
    title: toGroupText(group, renderedTitle),
    text: group === 'html' ? plainTextBody : toGroupText(group, renderedBody),
    markdown: group === 'markdown' ? renderedBody : undefined,
    html: group === 'html' ? renderedBody : undefined
  }
}

export function buildTestNotificationMessage(
  params: NotificationDispatchParams,
  locale: AppLocale = 'zh-CN',
  options: NotificationTemplateRenderOptions = {}
): DirectNotificationMessage {
  const presentation = resolveNotificationPresentation(params, locale)
  const group = options.group ?? 'text'
  const template = getEffectiveTemplate(group, 'testNotification', locale, options.templateConfig)
  const title = getMessage(locale, 'notifications.tests.title', {
    name:
      presentation.mode === 'merged'
        ? getMessage(locale, 'notifications.merge.summaryName', { count: presentation.subscriptions.length })
        : presentation.subscription.name || getMessage(locale, 'notifications.presentation.unnamedSubscription')
  })
  const values =
    presentation.mode === 'merged'
      ? createMergedTemplateValues(presentation, locale, group)
      : createSingleTemplateValues(presentation, locale, group)

  const renderedTitle = applyNotificationTemplate(template.titleTemplate, {
    ...values,
    title: group === 'html' ? escapeHtml(title) : group === 'markdown' ? escapeMarkdownValue(title) : title
  })
  const renderedBody = applyNotificationTemplate(template.bodyTemplate, {
    ...values,
    title: renderedTitle
  })
  const plainTextBody = [
    buildTestIntroBlock('text', locale),
    '',
    presentation.mode === 'merged'
      ? buildMergedNotificationBody(presentation, locale)
      : buildSingleNotificationBody(presentation, locale)
  ].join('\n').trim()

  return {
    title: toGroupText(group, renderedTitle),
    text: group === 'html' ? plainTextBody : toGroupText(group, renderedBody),
    markdown: group === 'markdown' ? renderedBody : undefined,
    html: group === 'html' ? renderedBody : undefined
  }
}
