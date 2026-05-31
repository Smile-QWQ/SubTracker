import { describe, expect, it } from 'vitest'
import {
  calculateNextRenewalDateTs,
  canRecalculateNextRenewal,
  validateSubscriptionForm
} from '../../../src/utils/subscription-form'

describe('subscription form helpers', () => {
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
})
