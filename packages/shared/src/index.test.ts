import { describe, expect, it } from 'vitest'
import {
  CreateSubscriptionSchema,
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  normalizeWebsiteUrlInput,
  SettingsSchema,
  SubtrackerBackupCommitSchema,
  SubtrackerBackupInspectSchema,
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
    expect(parsed.telegramConfig).toEqual({
      botToken: '',
      chatId: ''
    })
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
  })

  it('should validate timezone values', () => {
    expect(() => SettingsSchema.parse({ timezone: 'Mars/Olympus' })).toThrow()
    expect(SettingsSchema.parse({ timezone: 'America/Los_Angeles' }).timezone).toBe('America/Los_Angeles')
  })

  it('should allow wallos inspect payloads to include a source timezone', () => {
    expect(WallosImportInspectSchema.parse({
      filename: 'wallos.db',
      contentType: 'application/octet-stream',
      base64: 'ZmFrZQ==',
      sourceTimezone: 'Asia/Shanghai'
    }).sourceTimezone).toBe('Asia/Shanghai')
  })

  it('should validate subtracker backup inspect payloads', () => {
    expect(SubtrackerBackupInspectSchema.parse({
      filename: 'subtracker-backup.zip',
      contentType: 'application/zip',
      base64: 'ZmFrZQ=='
    })).toMatchObject({
      filename: 'subtracker-backup.zip',
      contentType: 'application/zip'
    })
  })

  it('should validate subtracker backup commit payloads', () => {
    expect(SubtrackerBackupCommitSchema.parse({
      importToken: '0123456789abcdef',
      mode: 'append',
      restoreSettings: true
    })).toMatchObject({
      mode: 'append',
      restoreSettings: true
    })
  })
})
