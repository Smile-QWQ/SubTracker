import { describe, expect, it } from 'vitest'
import { evaluateReminderRules, formatReminderRulesText, listReminderRuleDescriptions } from '../../../src/utils/reminder-rules'

describe('reminder rules helpers', () => {
  it('formats advance reminder rules into readable text', () => {
    expect(formatReminderRulesText('3&09:30;0&09:30;', 'advance')).toBe('提前 3 天 09:30；当天 09:30')
  })

  it('formats overdue reminder rules into readable text', () => {
    expect(formatReminderRulesText('1&09:30;2&09:30;', 'overdue')).toBe('过期 1 天 09:30；过期 2 天 09:30')
  })

  it('returns fallback when reminder rules are empty or invalid', () => {
    expect(formatReminderRulesText('', 'advance')).toBe('沿用系统默认')
    expect(formatReminderRulesText('abc', 'advance')).toBe('沿用系统默认')
  })

  it('evaluates advance reminder rules into list items', () => {
    const result = evaluateReminderRules('3&09:30;0&09:30;', 'advance')

    expect(result.title).toBe('演算结果')
    expect(result.entries.map((item) => item.description)).toEqual([
      '提前 3 天 09:30 提醒',
      '到期当天 09:30 提醒'
    ])
  })

  it('deduplicates and sorts reminder rules before previewing', () => {
    const result = evaluateReminderRules('0&09:30;3&09:30;3&09:30;0&09:30;', 'advance')

    expect(result.entries.map((item) => item.key)).toEqual(['3&09:30', '0&09:30'])
    expect(result.entries.map((item) => item.description)).toEqual([
      '提前 3 天 09:30 提醒',
      '到期当天 09:30 提醒'
    ])
  })

  it('evaluates overdue reminder rules into list items', () => {
    const result = evaluateReminderRules('1&09:30;3&08:00;', 'overdue')

    expect(result.title).toBe('演算结果')
    expect(result.entries.map((item) => item.description)).toEqual([
      '过期 1 天 09:30 提醒',
      '过期 3 天 08:00 提醒'
    ])
  })

  it('falls back to default rules when current value is empty', () => {
    const result = evaluateReminderRules('', 'advance', {
      fallbackValue: '3&09:30;0&09:30;'
    })

    expect(result.title).toBe('当前未填写，以下按系统默认到期前规则演算')
    expect(result.usingFallback).toBe(true)
    expect(result.entries.map((item) => item.description)).toEqual([
      '提前 3 天 09:30 提醒',
      '到期当天 09:30 提醒'
    ])
  })

  it('returns validation error when rule format is invalid', () => {
    const result = evaluateReminderRules('3&25:99;', 'advance')

    expect(result.title).toBe('规则格式有误')
    expect(result.error).toContain('时间必须为 HH:mm')
    expect(result.entries).toEqual([])
  })

  it('lists reminder rule descriptions for compact detail rendering', () => {
    expect(listReminderRuleDescriptions('0&09:30;3&09:30;', 'advance')).toEqual([
      { key: '3&09:30', description: '提前 3 天 09:30' },
      { key: '0&09:30', description: '当天 09:30' }
    ])
    expect(listReminderRuleDescriptions('', 'overdue', '1&09:30;2&09:30;')).toEqual([
      { key: '1&09:30', description: '过期 1 天 09:30' },
      { key: '2&09:30', description: '过期 2 天 09:30' }
    ])
  })

  it('supports localized reminder rule copy overrides', () => {
    const copy = {
      fallback: 'Use the system default',
      resultTitle: 'Preview result',
      invalidTitle: 'Invalid rule format',
      defaultRulesLabel: 'system default rules',
      defaultAdvanceRulesLabel: 'system default pre-renewal rules',
      defaultOverdueRulesLabel: 'system default overdue rules',
      fallbackPreviewTitle: 'No value entered. Previewing with {label}',
      fallbackInvalidTitle: '{label} is invalid',
      noAdvance: 'No pre-renewal reminder rules',
      noOverdue: 'No overdue reminder rules',
      parseFailed: 'Failed to parse rules',
      invalidSegmentFormat: 'Rule "{segment}" is invalid. Expected format: days&HH:mm',
      invalidDaysInteger: 'The days value in rule "{segment}" must be an integer',
      invalidOverdueDays: 'The days value in rule "{segment}" must be greater than or equal to 1',
      invalidAdvanceDays: 'The days value in rule "{segment}" cannot be less than 0',
      invalidTime: 'The time value in rule "{segment}" must use HH:mm',
      inlineAdvanceSameDay: 'On the due date at {time}',
      inlineAdvanceBefore: '{days} day(s) before at {time}',
      inlineOverdue: 'On overdue day {days} at {time}',
      evalAdvanceSameDay: 'Remind on the due date at {time}',
      evalAdvanceBefore: 'Remind {days} day(s) before at {time}',
      evalOverdue: 'Remind on overdue day {days} at {time}'
    }

    expect(formatReminderRulesText('', 'advance', undefined, { i18n: copy })).toBe('Use the system default')
    expect(formatReminderRulesText('3&09:30;0&09:30;', 'advance', undefined, { i18n: copy })).toBe(
      '3 day(s) before at 09:30；On the due date at 09:30'
    )

    const result = evaluateReminderRules('1&09:30;', 'overdue', { i18n: copy })
    expect(result.title).toBe('Preview result')
    expect(result.entries.map((item) => item.description)).toEqual(['Remind on overdue day 1 at 09:30'])
  })
})
