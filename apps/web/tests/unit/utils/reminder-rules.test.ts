import { getMessage } from '@subtracker/shared'
import { describe, expect, it } from 'vitest'
import { evaluateReminderRules, formatReminderRulesText, listReminderRuleDescriptions } from '../../../src/utils/reminder-rules'
import { getAppLocale } from '../../../src/locales'

describe('reminder rules helpers', () => {
  it('formats advance reminder rules into readable text', () => {
    const locale = getAppLocale()
    expect(formatReminderRulesText('3&09:30;0&09:30;', 'advance')).toBe(
      [
        getMessage(locale, 'validation.reminderRules.inlineAdvanceBefore', { days: 3, time: '09:30' }),
        getMessage(locale, 'validation.reminderRules.inlineAdvanceSameDay', { time: '09:30' })
      ].join('；')
    )
  })

  it('formats overdue reminder rules into readable text', () => {
    const locale = getAppLocale()
    expect(formatReminderRulesText('1&09:30;2&09:30;', 'overdue')).toBe(
      [
        getMessage(locale, 'validation.reminderRules.inlineOverdue', { days: 1, time: '09:30' }),
        getMessage(locale, 'validation.reminderRules.inlineOverdue', { days: 2, time: '09:30' })
      ].join('；')
    )
  })

  it('returns fallback when reminder rules are empty or invalid', () => {
    expect(formatReminderRulesText('', 'advance')).toBe(getMessage(getAppLocale(), 'validation.reminderRules.fallback'))
    expect(formatReminderRulesText('abc', 'advance')).toBe(getMessage(getAppLocale(), 'validation.reminderRules.fallback'))
  })

  it('lists reminder descriptions for detail drawer tag rendering', () => {
    const locale = getAppLocale()
    expect(listReminderRuleDescriptions('0&09:30;3&09:30;3&09:30;', 'advance')).toEqual([
      { key: '3&09:30', description: getMessage(locale, 'validation.reminderRules.inlineAdvanceBefore', { days: 3, time: '09:30' }) },
      { key: '0&09:30', description: getMessage(locale, 'validation.reminderRules.inlineAdvanceSameDay', { time: '09:30' }) }
    ])
    expect(listReminderRuleDescriptions('1&09:30;3&08:00;', 'overdue')).toEqual([
      { key: '1&09:30', description: getMessage(locale, 'validation.reminderRules.inlineOverdue', { days: 1, time: '09:30' }) },
      { key: '3&08:00', description: getMessage(locale, 'validation.reminderRules.inlineOverdue', { days: 3, time: '08:00' }) }
    ])
  })

  it('evaluates advance reminder rules into list items', () => {
    const result = evaluateReminderRules('3&09:30;0&09:30;', 'advance')
    const locale = getAppLocale()

    expect(result.title).toBe(getMessage(locale, 'validation.reminderRules.resultTitle'))
    expect(result.entries.map((item) => item.description)).toEqual([
      getMessage(locale, 'validation.reminderRules.evalAdvanceBefore', { days: 3, time: '09:30' }),
      getMessage(locale, 'validation.reminderRules.evalAdvanceSameDay', { time: '09:30' })
    ])
  })

  it('deduplicates and sorts reminder rules before previewing', () => {
    const result = evaluateReminderRules('0&09:30;3&09:30;3&09:30;0&09:30;', 'advance')
    const locale = getAppLocale()

    expect(result.entries.map((item) => item.key)).toEqual(['3&09:30', '0&09:30'])
    expect(result.entries.map((item) => item.description)).toEqual([
      getMessage(locale, 'validation.reminderRules.evalAdvanceBefore', { days: 3, time: '09:30' }),
      getMessage(locale, 'validation.reminderRules.evalAdvanceSameDay', { time: '09:30' })
    ])
  })

  it('evaluates overdue reminder rules into list items', () => {
    const result = evaluateReminderRules('1&09:30;3&08:00;', 'overdue')
    const locale = getAppLocale()

    expect(result.title).toBe(getMessage(locale, 'validation.reminderRules.resultTitle'))
    expect(result.entries.map((item) => item.description)).toEqual([
      getMessage(locale, 'validation.reminderRules.evalOverdue', { days: 1, time: '09:30' }),
      getMessage(locale, 'validation.reminderRules.evalOverdue', { days: 3, time: '08:00' })
    ])
  })

  it('falls back to default rules when current value is empty', () => {
    const result = evaluateReminderRules('', 'advance', {
      fallbackValue: '3&09:30;0&09:30;'
    })
    const locale = getAppLocale()

    expect(result.title).toBe(
      getMessage(locale, 'validation.reminderRules.fallbackPreviewTitle', {
        label: getMessage(locale, 'validation.reminderRules.defaultRulesLabel')
      })
    )
    expect(result.usingFallback).toBe(true)
    expect(result.entries.map((item) => item.description)).toEqual([
      getMessage(locale, 'validation.reminderRules.evalAdvanceBefore', { days: 3, time: '09:30' }),
      getMessage(locale, 'validation.reminderRules.evalAdvanceSameDay', { time: '09:30' })
    ])
  })

  it('returns validation error when rule format is invalid', () => {
    const result = evaluateReminderRules('3&25:99;', 'advance')
    const locale = getAppLocale()

    expect(result.title).toBe(getMessage(locale, 'validation.reminderRules.invalidTitle'))
    expect(result.error).toContain(getMessage(locale, 'validation.reminderRules.invalidTime', { segment: '3&25:99' }).replace('规则 "3&25:99" 中的', ''))
    expect(result.entries).toEqual([])
  })
})
