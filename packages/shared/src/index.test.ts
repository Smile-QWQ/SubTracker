import { describe, expect, it } from 'vitest'
import {
  AppLocaleSchema,
  AiDashboardSummaryStatusSchema,
  CreateSubscriptionSchema,
  DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT,
  DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT,
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  applyNotificationTemplate,
  compactNotificationTemplateConfig,
  createEmptyNotificationTemplateConfig,
  formatAiSummaryPreviewText,
  getDefaultAiDashboardSummaryPreviewPrompt,
  getDefaultAiDashboardSummaryPrompt,
  getDefaultAiSubscriptionPrompt,
  getDefaultNotificationTemplate,
  getMessage,
  normalizeWebsiteUrlInput,
  normalizeAppLocale,
  resolveNotificationTemplateConfig,
  resolveAppLocaleFromAcceptLanguage,
  SettingsSchema,
  SubtrackerBackupCommitSchema,
  SubtrackerBackupInspectSchema,
  DEFAULT_SMTP_PORT,
  WORKER_LITE_BLOCKED_SMTP_PORT,
  hasConfiguredResendConfig,
  isWorkerLiteBlockedSmtpPort,
  resolveDefaultEmailProvider,
  WallosImportInspectSchema
} from '../src/index'

describe('shared schema', () => {
  it('should validate create subscription payload', () => {
    const parsed = CreateSubscriptionSchema.parse({
      name: 'GitHub',
      amount: 10,
      currency: 'usd',
      billingIntervalUnit: 'month',
      startDate: '2026-04-01',
      nextRenewalDate: '2026-05-01'
    })

    expect(parsed.currency).toBe('USD')
    expect(parsed.billingIntervalCount).toBe(1)
    expect(parsed.advanceReminderRules).toBeUndefined()
  })

  it('should provide reminder-related setting defaults', () => {
    const parsed = SettingsSchema.parse({})

    expect(parsed.timezone).toBe('Asia/Shanghai')
    expect(parsed.defaultNotifyDays).toBe(3)
    expect(parsed.defaultAdvanceReminderRules).toBe(DEFAULT_ADVANCE_REMINDER_RULES)
    expect(parsed.notifyOnDueDay).toBe(true)
    expect(parsed.mergeMultiSubscriptionNotifications).toBe(true)
    expect(parsed.overdueReminderDays).toEqual([1, 2, 3])
    expect(parsed.defaultOverdueReminderRules).toBe(DEFAULT_OVERDUE_REMINDER_RULES)
    expect(parsed.telegramNotificationsEnabled).toBe(false)
    expect(parsed.appriseNotificationsEnabled).toBe(false)
    expect(parsed.appriseConfig).toEqual({
      apiBaseUrl: '',
      key: '',
      ignoreSsl: false,
      targets: [],
      lastSyncStatus: 'idle',
      lastSyncAt: null,
      lastSyncError: null
    })
    expect(parsed.notificationTemplateConfig).toEqual(createEmptyNotificationTemplateConfig())
    expect(parsed.aiConfig.dashboardSummaryEnabled).toBe(false)
    expect(parsed.aiConfig.dashboardSummaryPromptTemplate).toBe('')
    expect(parsed.storageCapabilities).toEqual({
      runtime: 'worker-lite',
      r2Enabled: false,
      logoStorageEnabled: false,
      wallosImportMode: 'json-db-zip'
    })
    expect(parsed.telegramConfig).toEqual({
      botToken: '',
      chatId: ''
    })
    expect(parsed.emailProvider).toBe('smtp')
    expect(parsed.smtpConfig.port).toBe(DEFAULT_SMTP_PORT)
  })

  it('normalizes website urls without protocol', () => {
    expect(normalizeWebsiteUrlInput('example.com')).toEqual({
      value: 'https://example.com',
      error: null
    })
    expect(normalizeWebsiteUrlInput('www.example.com/path?q=1')).toEqual({
      value: 'https://www.example.com/path?q=1',
      error: null
    })
    expect(normalizeWebsiteUrlInput('127.0.0.1:8080/demo')).toEqual({
      value: 'https://127.0.0.1:8080/demo',
      error: null
    })
  })

  it('rejects invalid website urls', () => {
    expect(normalizeWebsiteUrlInput('not a url')).toEqual({
      value: null,
      error: '请输入合法网址，例如 https://example.com'
    })
    expect(normalizeWebsiteUrlInput('not a url', 'en-US')).toEqual({
      value: null,
      error: 'Enter a valid URL, for example https://example.com'
    })
  })

  it('should validate timezone values', () => {
    expect(() => SettingsSchema.parse({ timezone: 'Mars/Olympus' })).toThrow('validation.timezoneInvalid')
    expect(SettingsSchema.parse({ timezone: 'America/Los_Angeles' }).timezone).toBe('America/Los_Angeles')
  })

  it('should validate worker-lite wallos inspect payloads', () => {
    expect(WallosImportInspectSchema.parse({
      filename: 'wallos.db',
      fileType: 'db',
      preview: {
        isWallos: true,
        summary: {
          fileType: 'db',
          subscriptionsTotal: 1,
          tagsTotal: 0,
          usedTagsTotal: 0,
          supportedSubscriptions: 1,
          skippedSubscriptions: 0,
          globalNotifyDays: 3,
          zipLogoMatched: 0,
          zipLogoMissing: 0
        },
        tags: [],
        usedTags: [],
        subscriptionsPreview: [],
        warnings: []
      },
      logoAssets: []
    }).fileType).toBe('db')
  })

  it('should validate subtracker backup inspect payloads', () => {
    expect(SubtrackerBackupInspectSchema.parse({
      filename: 'subtracker-backup.zip',
      manifest: {},
      logoAssets: []
    })).toMatchObject({
      filename: 'subtracker-backup.zip'
    })
  })

  it('should validate subtracker backup commit payloads', () => {
    expect(SubtrackerBackupCommitSchema.parse({
      manifest: {},
      logoAssets: [],
      mode: 'append',
      restoreSettings: true
    })).toMatchObject({
      mode: 'append',
      restoreSettings: true
    })
  })

  it('should expose dashboard summary prompt and status schema', () => {
    expect(DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT).toContain('订阅运营摘要助手')
    expect(DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT).toContain('摘要压缩助手')
    expect(AiDashboardSummaryStatusSchema.parse('success')).toBe('success')
    expect(() => AiDashboardSummaryStatusSchema.parse('unknown')).toThrow()
  })

  it('should normalize app locale values and accept-language headers', () => {
    expect(AppLocaleSchema.parse('en-US')).toBe('en-US')
    expect(normalizeAppLocale('en')).toBe('en-US')
    expect(normalizeAppLocale('ZH-hans-CN')).toBe('zh-CN')
    expect(resolveAppLocaleFromAcceptLanguage('en-GB,en;q=0.9,zh-CN;q=0.8')).toBe('en-US')
    expect(resolveAppLocaleFromAcceptLanguage('', 'en-US')).toBe('en-US')
  })

  it('should provide locale-aware default ai prompts', () => {
    expect(getDefaultAiSubscriptionPrompt('en-US')).toContain('subscription billing extractor')
    expect(getDefaultAiDashboardSummaryPrompt('en-US')).toContain('subscription operations summary assistant')
    expect(getDefaultAiDashboardSummaryPreviewPrompt('en-US')).toContain('summary compression assistant')
  })

  it('resolves default email provider without overriding historical resend users', () => {
    expect(resolveDefaultEmailProvider({ storedProvider: 'resend' })).toBe('resend')
    expect(
      resolveDefaultEmailProvider({
        resendConfig: {
          apiKey: 're_test',
          from: '',
          to: ''
        }
      })
    ).toBe('resend')
    expect(
      resolveDefaultEmailProvider({
        resendConfig: {
          apiKey: '',
          from: '',
          to: ''
        }
      })
    ).toBe('smtp')
    expect(hasConfiguredResendConfig({ apiKey: '', from: 'noreply@example.com', to: '' })).toBe(true)
    expect(hasConfiguredResendConfig({ apiKey: '', from: '', to: '' })).toBe(false)
    expect(isWorkerLiteBlockedSmtpPort(WORKER_LITE_BLOCKED_SMTP_PORT)).toBe(true)
    expect(isWorkerLiteBlockedSmtpPort(587)).toBe(false)
  })

  it('provides locale-aware shared messages with fallback and interpolation', () => {
    expect(getMessage('en-US', 'validation.reminderRules.fallback')).toBe('Use the system default')
    expect(getMessage('en-US', 'api.errors.ai.disabled')).toBe('AI is disabled')
    expect(getMessage('en-US', 'common.status.fresh')).toBe('Up to date')
    expect(getMessage('en-US', 'common.status.stale')).toBe('Outdated')
    expect(getMessage('en-US', 'notifications.forgotPassword.expiresInMinutes', { minutes: 15 })).toBe(
      'Expires in: 15 minutes'
    )
    expect(getMessage('en-US', 'common.separators.fieldList')).toBe(', ')
    expect(getMessage('en-US', 'common.separators.notificationDetail')).toBe('; ')
    expect(getMessage('en-US', 'notifications.wrappers.detailStart')).toBe(' (')
    expect(getMessage('en-US', 'notifications.wrappers.detailEnd')).toBe(')')
    expect(getMessage('en-US', 'formatting.monthLabel.long')).toBe('MMMM YYYY')
    expect(getMessage('en-US', 'validation.notificationTargetUrl.invalidFormat', { label: 'Webhook URL' })).toBe(
      'Webhook URL is invalid'
    )
    expect(
      getMessage('en-US', 'statistics.labels.amountAxis', { currency: 'CNY' })
    ).toBe('Amount (CNY)')
    expect(getMessage('en-US', 'subscriptions.backupModal.description')).toContain('exchange-rate data')
    expect(getMessage('en-US', 'api.runtime.initialExchangeRateRefreshFailed')).toContain(
      'existing exchange-rate data'
    )
    expect(getMessage('en-US', 'api.errors.exchangeRates.payloadEmpty')).toBe('The exchange-rate payload is empty')
    expect(getMessage('en-US', 'api.errors.notifications.emptyDedupEntries')).toBe(
      'Cannot build notification dispatch params from empty dedup entries'
    )
    expect(getMessage('zh-CN', 'login.title')).toBe('登录 SubTracker Lite')
    expect(getMessage('en-US', 'login.title')).toBe('Sign in to SubTracker Lite')
    expect(getMessage('zh-CN', 'app.viewRelease')).toBe('查看 Commit')
    expect(getMessage('en-US', 'app.viewRelease')).toBe('View commit')
    expect(getMessage('zh-CN', 'app.noNewRelease')).toContain('lite 提交')
    expect(getMessage('en-US', 'app.noNewRelease')).toContain('lite commits')
    expect(getMessage('zh-CN', 'settings.placeholders.fromAddress', { at: '@' })).toBe(
      'SubTracker Lite <noreply@example.com>'
    )
    expect(getMessage('en-US', 'settings.placeholders.customHeaders')).toContain('X-App: SubTracker Lite')
    expect(getMessage('zh-CN', 'settings.helps.workerRuntime')).toBe('当前运行环境为 Cloudflare Worker + D1')
    expect(getMessage('en-US', 'settings.helps.workerRuntimeR2Disabled')).toContain('remote logo references')
    expect(getMessage('zh-CN', 'settings.helps.notificationSettingsWorkerLite')).toContain('SMTP 与 Resend')
    expect(getMessage('zh-CN', 'settings.helps.smtpPortWorkerLite')).toContain('25 端口')
    expect(getMessage('en-US', 'settings.validation.smtpPort25Blocked')).toContain('port 25')
    expect(getMessage('zh-CN', 'api.errors.notifications.smtpPort25Blocked')).toContain('465 或 587')
    expect(getMessage('en-US', 'settings.about.liteBranch')).toBe('Lite Branch')
    expect(getMessage('en-US', 'nonexistent.message.key')).toBe('nonexistent.message.key')
  })

  it('formats ai summary preview text into multiple readable lines', () => {
    expect(
      formatAiSummaryPreviewText(
        '当前 13 个活跃订阅，月支出 1254.61 元，占预算 69.7%。年度支出已用 83.6%，剩余预算仅 2944.68 元。未来 30 天续订密集，年度预算可能在 2-3 个月内耗尽。'
      )
    ).toBe(
      '当前 13 个活跃订阅，月支出 1254.61 元，占预算 69.7%。年度支出已用 83.6%，剩余预算仅 2944.68 元。未来 30 天续订密集，年度预算可能在 2-3 个月内耗尽。'
    )
  })

  it('resolves notification template defaults by group and locale', () => {
    const defaults = getDefaultNotificationTemplate('markdown', 'singleReminder', 'en-US')

    expect(defaults.titleTemplate).toContain('{{subscription.name}}')
    expect(defaults.bodyTemplate).toContain('{{detailsBlock}}')

    const resolved = resolveNotificationTemplateConfig(
      {
        markdown: {
          ...createEmptyNotificationTemplateConfig().markdown,
          singleReminder: {
            titleTemplate: '## {{title}}',
            bodyTemplate: ''
          }
        }
      },
      'en-US'
    )

    expect(resolved.markdown.singleReminder.titleTemplate).toBe('## {{title}}')
    expect(resolved.markdown.singleReminder.bodyTemplate).toContain('{{detailsBlock}}')
    expect(resolved.text.forgotPassword.titleTemplate).toBe(getMessage('en-US', 'notifications.forgotPassword.title'))
  })

  it('treats stored locale defaults as fallback templates across locale switches', () => {
    const storedEnglishDefaults = {
      markdown: {
        ...createEmptyNotificationTemplateConfig().markdown,
        singleReminder: getDefaultNotificationTemplate('markdown', 'singleReminder', 'en-US')
      }
    }

    const resolvedZh = resolveNotificationTemplateConfig(storedEnglishDefaults, 'zh-CN')
    expect(resolvedZh.markdown.singleReminder.titleTemplate).toBe(
      getDefaultNotificationTemplate('markdown', 'singleReminder', 'zh-CN').titleTemplate
    )

    const compacted = compactNotificationTemplateConfig({
      markdown: {
        ...createEmptyNotificationTemplateConfig().markdown,
        singleReminder: getDefaultNotificationTemplate('markdown', 'singleReminder', 'zh-CN')
      }
    })

    expect(compacted.markdown.singleReminder.titleTemplate).toBe('')
    expect(compacted.markdown.singleReminder.bodyTemplate).toBe('')
  })

  it('applies notification templates with placeholder replacement and preserves unknown keys', () => {
    expect(
      applyNotificationTemplate('Hello {{ name }}\n\n\n{{unknown}}', {
        name: 'SubTracker'
      })
    ).toBe('Hello SubTracker\n\n{{unknown}}')
  })
})
