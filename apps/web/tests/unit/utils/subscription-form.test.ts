import { describe, expect, it } from 'vitest'
import {
  buildFrequencyOptions,
  buildSubscriptionCopyDraft,
  calculateNextRenewalDateTs,
  canRecalculateNextRenewal,
  parseFrequencyOptionCreateInput,
  validateSubscriptionForm,
  type SubscriptionFormValidationInput
} from '../../../src/utils/subscription-form'

describe('subscription form helpers', () => {
  it('copies only editable values and clones tags without identity or payment records', () => {
    const source = {
      id: 'original', name: 'Lifetime license', description: 'Desktop app', amount: 100, currency: 'USD',
      billingType: 'lifetime' as const, billingIntervalCount: 1, billingIntervalUnit: 'month' as const,
      autoRenew: false, startDate: '2026-01-01', nextRenewalDate: '2026-01-01',
      webhookEnabled: false, notes: 'License key', websiteUrl: 'https://example.com', logoUrl: '/logo.png',
      logoSource: 'upload', status: 'active' as const, notifyDaysBefore: 3,
      tags: [{ id: 'tag-1', name: 'Tools', color: '#fff', icon: '', sortOrder: 0 }],
      createdAt: '2026-01-01', updatedAt: '2026-01-01', paymentRecords: [{ id: 'payment-1' }]
    }
    const draft = buildSubscriptionCopyDraft(source)

    expect(draft).toMatchObject({ name: source.name, currency: 'USD', billingType: 'lifetime', logoUrl: '/logo.png' })
    for (const field of ['id', 'status', 'createdAt', 'updatedAt', 'paymentRecords', 'notifyDaysBefore']) {
      expect(draft).not.toHaveProperty(field)
    }
    expect(draft.tags).toEqual(source.tags)
    expect(draft.tags).not.toBe(source.tags)
    expect(draft.tags?.[0]).not.toBe(source.tags[0])
    expect(buildSubscriptionCopyDraft({ ...source, billingType: undefined }).billingType).toBe('recurring')
  })

  it('ignores renewal placeholders for lifetime but still validates the purchase date and amount', () => {
    const input: SubscriptionFormValidationInput = {
      billingType: 'lifetime', name: 'License', description: '', amount: 100, currency: 'USD',
      billingIntervalCount: 0, billingIntervalUnit: '',
      startDateTs: Date.parse('2026-01-01'), nextRenewalDateTs: null, websiteUrl: '', notes: ''
    }
    expect(validateSubscriptionForm(input).errors).toEqual({})
    expect(validateSubscriptionForm({ ...input, nextRenewalDateTs: Date.parse('2020-01-01') }).errors).toEqual({})
    expect(validateSubscriptionForm({ ...input, startDateTs: null, amount: -1 }).errors).toHaveProperty('startDateTs')
    expect(validateSubscriptionForm({ ...input, amount: -1 }).errors).toHaveProperty('amount')
    const recurringErrors = validateSubscriptionForm({ ...input, billingType: undefined }).errors
    expect(recurringErrors).toHaveProperty('billingIntervalCount')
    expect(recurringErrors).toHaveProperty('billingIntervalUnit')
    expect(recurringErrors).toHaveProperty('nextRenewalDateTs')
  })

  it('normalizes websiteUrl without protocol before submit', () => {
    const result = validateSubscriptionForm({
      name: 'GitHub Pro',
      description: '',
      amount: 99,
      currency: 'USD',
      billingIntervalCount: 1,
      billingIntervalUnit: 'year',
      startDateTs: Date.parse('2024-01-01T00:00:00.000Z'),
      nextRenewalDateTs: Date.parse('2027-01-01T00:00:00.000Z'),
      websiteUrl: 'example.com',
      notes: ''
    })

    expect(result.errors.websiteUrl).toBeUndefined()
    expect(result.normalizedWebsiteUrl).toBe('https://example.com')
  })

  it('blocks invalid websiteUrl with field error', () => {
    const result = validateSubscriptionForm({
      name: 'GitHub Pro',
      description: '',
      amount: 99,
      currency: 'USD',
      billingIntervalCount: 1,
      billingIntervalUnit: 'year',
      startDateTs: Date.parse('2024-01-01T00:00:00.000Z'),
      nextRenewalDateTs: Date.parse('2027-01-01T00:00:00.000Z'),
      websiteUrl: 'not a url',
      notes: ''
    })

    expect(result.errors.websiteUrl).toBe('请输入合法网址，例如 https://example.com')
    expect(result.normalizedWebsiteUrl).toBeNull()
  })

  it('recalculates next renewal date only when explicitly requested', () => {
    const nextRenewalTs = calculateNextRenewalDateTs(Date.parse('2024-01-01T00:00:00.000Z'), 1, 'year')

    expect(new Date(nextRenewalTs).toISOString()).toBe('2025-01-01T00:00:00.000Z')
  })

  it('disables manual recalculate button when required fields are missing', () => {
    expect(
      canRecalculateNextRenewal({
        startDateTs: null,
        billingIntervalCount: 1,
        billingIntervalUnit: 'year'
      })
    ).toBe(false)

    expect(
      canRecalculateNextRenewal({
        startDateTs: Date.parse('2024-01-01T00:00:00.000Z'),
        billingIntervalCount: 0,
        billingIntervalUnit: 'year'
      })
    ).toBe(false)
  })

  it('requires next renewal date to be after or equal to start date', () => {
    const result = validateSubscriptionForm({
      name: 'GitHub Pro',
      description: '',
      amount: 99,
      currency: 'USD',
      billingIntervalCount: 1,
      billingIntervalUnit: 'year',
      startDateTs: Date.parse('2027-01-01T00:00:00.000Z'),
      nextRenewalDateTs: Date.parse('2024-01-01T00:00:00.000Z'),
      websiteUrl: '',
      notes: ''
    })

    expect(result.errors.nextRenewalDateTs).toBe('下次续订日期不能早于开始日期')
  })

  it('validates description and notes length locally', () => {
    const result = validateSubscriptionForm({
      name: 'GitHub Pro',
      description: 'a'.repeat(501),
      amount: 99,
      currency: 'USD',
      billingIntervalCount: 1,
      billingIntervalUnit: 'year',
      startDateTs: Date.parse('2024-01-01T00:00:00.000Z'),
      nextRenewalDateTs: Date.parse('2027-01-01T00:00:00.000Z'),
      websiteUrl: '',
      notes: 'b'.repeat(1001)
    })

    expect(result.errors.description).toBe('描述不能超过 500 个字符')
    expect(result.errors.notes).toBe('备注不能超过 1000 个字符')
  })

  it('keeps 1-12 quick frequency options and appends the selected custom value', () => {
    const defaultOptions = buildFrequencyOptions(1)
    const customOptions = buildFrequencyOptions(18)

    expect(defaultOptions).toHaveLength(12)
    expect(defaultOptions[0]).toEqual({ label: '1', value: 1 })
    expect(defaultOptions[11]).toEqual({ label: '12', value: 12 })
    expect(customOptions.at(-1)).toEqual({ label: '18', value: 18 })
  })

  it('accepts custom positive integer frequency values only', () => {
    expect(parseFrequencyOptionCreateInput('13')).toEqual({ label: '13', value: 13 })
    expect(parseFrequencyOptionCreateInput(' 18 ')).toEqual({ label: '18', value: 18 })
    expect(parseFrequencyOptionCreateInput('0')).toBeNull()
    expect(parseFrequencyOptionCreateInput('-2')).toBeNull()
    expect(parseFrequencyOptionCreateInput('1.5')).toBeNull()
    expect(parseFrequencyOptionCreateInput('abc')).toBeNull()
  })
})
