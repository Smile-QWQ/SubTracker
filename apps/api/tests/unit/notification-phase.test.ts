import { describe, expect, it } from 'vitest'
import {
  buildAdvanceReminderRulesFromLegacy,
  buildAdvanceReminderRulesFromLegacyWithDefault,
  buildOverdueReminderRules,
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  normalizeReminderRules,
  parseReminderRules
} from '../../src/services/reminder-rules.service'

describe('reminder rules helpers', () => {
  it('parses and normalizes advance rules', () => {
    expect(parseReminderRules('0&09:30;3&10:00;', 'advance')).toEqual([
      { days: 3, time: '10:00', hour: 10, minute: 0 },
      { days: 0, time: '09:30', hour: 9, minute: 30 }
    ])

    expect(normalizeReminderRules(' 0&09:30 ; 3&10:00; ', 'advance')).toBe('3&10:00;0&09:30;')
  })

  it('parses and normalizes overdue rules', () => {
    expect(normalizeReminderRules('3&09:30;1&08:00;2&09:30;', 'overdue')).toBe('1&08:00;2&09:30;3&09:30;')
  })

  it('rejects invalid reminder rule input', () => {
    expect(() => parseReminderRules('abc', 'advance')).toThrow('格式无效')
    expect(() => parseReminderRules('0&09:30;', 'overdue')).toThrow('必须大于等于 1')
    expect(() => parseReminderRules('3&25:00;', 'advance')).toThrow('时间必须为 HH:mm')
  })

  it('derives legacy-compatible values from rules', () => {
    expect(deriveNotifyDaysBeforeFromAdvanceRules('3&09:30;0&09:30;')).toBe(3)
    expect(deriveNotifyOnDueDayFromAdvanceRules('3&09:30;0&09:30;')).toBe(true)
    expect(deriveOverdueReminderDaysFromRules('1&09:30;2&09:30;5&09:30;')).toEqual([1, 2])
  })

  it('builds rules from legacy values', () => {
    expect(buildAdvanceReminderRulesFromLegacy(3, true)).toBe('3&09:30;0&09:30;')
    expect(buildAdvanceReminderRulesFromLegacyWithDefault(5, '3&09:30;0&09:30;')).toBe('5&09:30;0&09:30;')
    expect(buildOverdueReminderRules([1, 3])).toBe('1&09:30;3&09:30;')
  })
})
