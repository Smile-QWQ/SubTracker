import { describe, expect, it } from 'vitest'
import {
  AiDashboardSummaryStatusSchema,
  CreateSubscriptionSchema,
  DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT,
  DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT,
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  ForgotPasswordRequestSchema,
  ForgotPasswordResetSchema,
  formatAiSummaryPreviewText,
  SettingsSchema,
  SubtrackerBackupCommitSchema,
  SubtrackerBackupInspectSchema
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

    expect(parsed.defaultNotifyDays).toBe(3)
    expect(parsed.defaultAdvanceReminderRules).toBe(DEFAULT_ADVANCE_REMINDER_RULES)
    expect(parsed.notifyOnDueDay).toBe(true)
    expect(parsed.forgotPasswordEnabled).toBe(false)
    expect(parsed.mergeMultiSubscriptionNotifications).toBe(true)
    expect(parsed.overdueReminderDays).toEqual([1, 2, 3])
    expect(parsed.defaultOverdueReminderRules).toBe(DEFAULT_OVERDUE_REMINDER_RULES)
    expect(parsed.timezone).toBe('Asia/Shanghai')
    expect(parsed.aiConfig.dashboardSummaryEnabled).toBe(false)
    expect(parsed.aiConfig.dashboardSummaryPromptTemplate).toBe('')
    expect(parsed.telegramNotificationsEnabled).toBe(false)
    expect(parsed.telegramConfig).toEqual({
      botToken: '',
      chatId: ''
    })
  })

  it('should validate timezone values', () => {
    expect(() => SettingsSchema.parse({ timezone: 'Mars/Olympus' })).toThrow()
    expect(SettingsSchema.parse({ timezone: 'America/Los_Angeles' }).timezone).toBe('America/Los_Angeles')
  })

  it('should validate subtracker backup inspect payload', () => {
    const parsed = SubtrackerBackupInspectSchema.parse({
      filename: 'subtracker-backup.zip',
      manifest: {
        app: 'SubTracker'
      },
      logoAssets: [
        {
          path: 'logos/test.png',
          filename: 'test.png',
          contentType: 'image/png',
          base64: 'ZmFrZQ=='
        }
      ]
    })

    expect(parsed.filename).toBe('subtracker-backup.zip')
    expect(parsed.logoAssets).toHaveLength(1)
  })

  it('should validate subtracker backup commit payload', () => {
    const parsed = SubtrackerBackupCommitSchema.parse({
      importToken: 'x'.repeat(24),
      mode: 'append',
      restoreSettings: true
    })

    expect(parsed.mode).toBe('append')
    expect(parsed.restoreSettings).toBe(true)
  })

  it('should expose dashboard summary prompt and status schema', () => {
    expect(DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT).toContain('订阅运营摘要助手')
    expect(DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT).toContain('摘要压缩助手')
    expect(AiDashboardSummaryStatusSchema.parse('success')).toBe('success')
    expect(() => AiDashboardSummaryStatusSchema.parse('unknown')).toThrow()
  })

  it('formats ai summary preview text into readable plain text', () => {
    expect(
      formatAiSummaryPreviewText(
        '## 总览\n- 当前 13 个活跃订阅\n- 月支出 1254.61 元\n\n## 近期风险\n1. 未来 30 天续订密集'
      )
    ).toBe('总览 当前 13 个活跃订阅 月支出 1254.61 元 近期风险 未来 30 天续订密集')
  })

  it('validates forgot password request and reset payloads', () => {
    expect(ForgotPasswordRequestSchema.parse({ username: 'admin' }).username).toBe('admin')
    expect(
      ForgotPasswordResetSchema.parse({
        username: 'admin',
        code: '123456',
        newPassword: 'new-password'
      }).code
    ).toBe('123456')
    expect(() =>
      ForgotPasswordResetSchema.parse({
        username: 'admin',
        code: '12345',
        newPassword: 'new-password'
      })
    ).toThrow()
  })
})
