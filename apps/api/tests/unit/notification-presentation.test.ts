import { describe, expect, it } from 'vitest'
import { createEmptyNotificationTemplateConfig, getMessage } from '@subtracker/shared'
import {
  buildTelegramMarkdownV2FromMarkdown,
  buildNotificationMessage,
  buildForgotPasswordNotificationMessage,
  buildTestNotificationMessage,
  resolveNotificationPresentation
} from '../../src/services/notification-presentation.service'
import { type NotificationDispatchParams } from '../../src/services/notification-merge.service'

const netflixPayload = {
  id: 'sub-1',
  name: 'Netflix',
  nextRenewalDate: '2026-05-01',
  notifyDaysBefore: 0,
  amount: 10,
  currency: 'USD',
  status: 'active',
  tagNames: ['视频'],
  websiteUrl: 'https://netflix.com',
  notes: '',
  phase: 'due_today' as const,
  daysUntilRenewal: 0,
  daysOverdue: 0,
  reminderRuleTime: '09:30',
  reminderRuleDays: 0
}

const spotifyPayload = {
  id: 'sub-2',
  name: 'Spotify',
  nextRenewalDate: '2026-04-30',
  notifyDaysBefore: 0,
  amount: 20,
  currency: 'USD',
  status: 'expired',
  tagNames: ['音乐'],
  websiteUrl: 'https://spotify.com',
  notes: '',
  phase: 'overdue' as const,
  daysUntilRenewal: 0,
  daysOverdue: 1,
  reminderRuleTime: '09:30',
  reminderRuleDays: 1
}

describe('notification presentation', () => {
  it('keeps single reminder title and body stable', () => {
    const params: NotificationDispatchParams = {
      eventType: 'subscription.reminder_due',
      resourceKey: 'subscription:sub-1',
      periodKey: '2026-05-01:due_today:advance-0@09:30',
      subscriptionId: 'sub-1',
      payload: {
        ...netflixPayload
      }
    }

    expect(resolveNotificationPresentation(params)).toMatchObject({
      mode: 'single',
      phaseLabel: getMessage('zh-CN', 'notifications.phases.dueToday')
    })
    expect(buildNotificationMessage(params)).toMatchObject({
      title: getMessage('zh-CN', 'notifications.titles.single', {
        phase: getMessage('zh-CN', 'notifications.phases.dueToday'),
        name: 'Netflix'
      })
    })
    expect(buildNotificationMessage(params).text).toContain(getMessage('zh-CN', 'notifications.presentation.subscriptionName', { name: 'Netflix' }))
  })

  it('keeps merged reminder title and body stable', () => {
    const params: NotificationDispatchParams = {
      eventType: 'subscription.overdue',
      resourceKey: 'subscriptions:scan-summary',
      periodKey:
        '2026-05-01:summary:2026-04-30:overdue_day_1:overdue-1@09:30|2026-05-01:due_today:advance-0@09:30',
      payload: {
        merged: true,
        mergedCount: 2,
        subscriptions: [netflixPayload, spotifyPayload],
        mergedSections: [
          {
            phase: 'due_today',
            title: getMessage('zh-CN', 'notifications.merge.phaseDueToday'),
            eventType: 'subscription.reminder_due',
            subscriptions: [netflixPayload]
          },
          {
            phase: 'overdue_day_1',
            title: getMessage('zh-CN', 'notifications.merge.phaseOverdueDay', { days: 1 }),
            eventType: 'subscription.overdue',
            subscriptions: [spotifyPayload]
          }
        ],
        name: getMessage('zh-CN', 'notifications.merge.summaryName', { count: 2 }),
        nextRenewalDate: '2026-05-01',
        notifyDaysBefore: 0,
        amount: 30,
        currency: 'USD',
        status: 'expired',
        tagNames: [],
        websiteUrl: '',
        notes: '',
        phase: 'summary',
        daysUntilRenewal: 0,
        daysOverdue: 1,
        reminderRuleTime: '09:30',
        reminderRuleDays: 0
      }
    }

    const message = buildNotificationMessage(params)
    expect(resolveNotificationPresentation(params)).toMatchObject({
      mode: 'merged',
      phaseLabel: getMessage('zh-CN', 'notifications.phases.summary')
    })
    expect(message.title).toBe(
      getMessage('zh-CN', 'notifications.presentation.mergedTitle', {
        prefix: getMessage('zh-CN', 'notifications.phases.summary'),
        count: 2
      })
    )
    expect(message.text).toContain(
      getMessage('zh-CN', 'notifications.presentation.sectionTitle', {
        title: getMessage('zh-CN', 'notifications.merge.phaseDueToday'),
        count: 1
      })
    )
    expect(message.text).toContain(
      getMessage('zh-CN', 'notifications.presentation.sectionTitle', {
        title: getMessage('zh-CN', 'notifications.merge.phaseOverdueDay', { days: 1 }),
        count: 1
      })
    )
  })

  it('renders markdown reminder bodies for markdown-capable channels', () => {
    const message = buildNotificationMessage(
      {
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:sub-1',
        periodKey: '2026-05-01:due_today:advance-0@09:30',
        subscriptionId: 'sub-1',
        payload: {
          ...netflixPayload
        }
      },
      'zh-CN',
      {
        group: 'markdown',
        templateConfig: createEmptyNotificationTemplateConfig()
      }
    )

    expect(message.markdown).toContain('- **名称**：Netflix')
    expect(message.html).toBeUndefined()
  })

  it('converts shared markdown into Telegram MarkdownV2 without leaking extra escapes', () => {
    const message = buildTestNotificationMessage(
      {
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:sub-1',
        periodKey: '2026-05-01:due_today:advance-0@09:30',
        subscriptionId: 'sub-1',
        payload: {
          ...netflixPayload,
          nextRenewalDate: '2026-05-28',
          amount: 19.9,
          currency: 'CNY',
          websiteUrl: 'https://example.com',
          notes: '这是一条测试通知',
          phase: 'upcoming',
          daysUntilRenewal: 3,
          reminderRuleDays: 3
        }
      },
      'zh-CN',
      {
        group: 'markdown',
        templateConfig: createEmptyNotificationTemplateConfig()
      }
    )

    expect(message.markdown).toContain('https://example\\.com')
    expect(message.html).toBeUndefined()

    const telegramMarkdown = buildTelegramMarkdownV2FromMarkdown(message.markdown ?? '')
    expect(telegramMarkdown).toContain('> 这是一条测试通知，用于验证当前通知渠道和模板配置。')
    expect(telegramMarkdown).toContain('2026\\-05\\-28')
    expect(telegramMarkdown).toContain('19\\.9 CNY')
    expect(telegramMarkdown).toContain('[https://example\\.com](https://example.com)')
    expect(telegramMarkdown).not.toContain('<blockquote>')
  })

  it('renders html reminder bodies for html-capable channels', () => {
    const message = buildNotificationMessage(
      {
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:sub-1',
        periodKey: '2026-05-01:due_today:advance-0@09:30',
        subscriptionId: 'sub-1',
        payload: {
          ...netflixPayload
        }
      },
      'zh-CN',
      {
        group: 'html',
        templateConfig: createEmptyNotificationTemplateConfig()
      }
    )

    expect(message.html).toContain('<div class="subtracker-notification subtracker-notification--single">')
    expect(message.html).toContain('<li><strong>名称</strong>：Netflix</li>')
    expect(message.text).toContain('名称：Netflix')
  })

  it('renders forgot-password templates by group', () => {
    const markdownMessage = buildForgotPasswordNotificationMessage(
      {
        username: 'admin',
        code: '123456',
        expiresInMinutes: 10
      },
      'zh-CN',
      {
        group: 'markdown',
        templateConfig: createEmptyNotificationTemplateConfig()
      }
    )

    const htmlMessage = buildForgotPasswordNotificationMessage(
      {
        username: 'admin',
        code: '123456',
        expiresInMinutes: 10
      },
      'zh-CN',
      {
        group: 'html',
        templateConfig: createEmptyNotificationTemplateConfig()
      }
    )

    expect(markdownMessage.markdown).toContain('**用户名**')
    expect(htmlMessage.html).toContain('<strong>用户名</strong>：admin')
    expect(htmlMessage.text).toContain('用户名：admin')
  })

  it('renders test notifications with template intro blocks', () => {
    const message = buildTestNotificationMessage(
      {
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:sub-1',
        periodKey: '2026-05-01:due_today:advance-0@09:30',
        subscriptionId: 'sub-1',
        payload: {
          ...netflixPayload
        }
      },
      'zh-CN',
      {
        group: 'markdown',
        templateConfig: createEmptyNotificationTemplateConfig()
      }
    )

    expect(message.title).toContain('测试')
    expect(message.markdown).toContain('> 这是一条测试通知')
    expect(message.markdown).toContain('Netflix')
  })

  it('handles quotes, lists, code blocks and special characters in Telegram MarkdownV2 output', () => {
    const telegramMarkdown = buildTelegramMarkdownV2FromMarkdown([
      '> 引用说明',
      '',
      '- **名称**：Netflix',
      '- **金额**：19\\.9 CNY',
      '- **备注**：hello = world ~ wow',
      '',
      '### 小节标题',
      '',
      '1. **第一项**',
      '',
      '`code.with-dash`',
      '',
      '```ts',
      'const value = a_b;',
      '```',
      '',
      'emoji 😀'
    ].join('\n'))

    expect(telegramMarkdown).toContain('> 引用说明')
    expect(telegramMarkdown).toContain('• *名称*：Netflix')
    expect(telegramMarkdown).toContain('• *金额*：19\\.9 CNY')
    expect(telegramMarkdown).toContain('• *备注*：hello \\= world \\~ wow')
    expect(telegramMarkdown).toContain('*小节标题*')
    expect(telegramMarkdown).toContain('1\\. *第一项*')
    expect(telegramMarkdown).toContain('`code.with-dash`')
    expect(telegramMarkdown).toContain('```ts\nconst value = a_b;\n```')
    expect(telegramMarkdown).toContain('emoji 😀')
  })

  it('wraps bare urls into Telegram MarkdownV2 links', () => {
    const telegramMarkdown = buildTelegramMarkdownV2FromMarkdown([
      '普通文本 https://example.com/path?a=1&b=2',
      '- **网址**：https://sub.example.com/foo-bar',
      '`https://code.example.com`',
      '[已有链接](https://wrapped.example.com)'
    ].join('\n'))

    expect(telegramMarkdown).toContain('[https://example\\.com/path?a\\=1&b\\=2](https://example.com/path?a=1&b=2)')
    expect(telegramMarkdown).toContain('[https://sub\\.example\\.com/foo\\-bar](https://sub.example.com/foo-bar)')
    expect(telegramMarkdown).toContain('`https://code.example.com`')
    expect(telegramMarkdown).toContain('[已有链接](https://wrapped.example.com)')
  })
})
