import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('subscription detail drawer value metrics', () => {
  it('shows current cycle and remaining value fields', () => {
    const source = readFileSync('src/components/SubscriptionDetailDrawer.vue', 'utf8')

    expect(source).toContain('当前周期')
    expect(source).toContain('剩余价值')
    expect(source).toContain('detail.currentCycleStartDate')
    expect(source).toContain('detail.currentCycleEndDate')
    expect(source).toContain('detail.remainingValue')
    expect(source).toContain('detail.remainingValueCurrency')
    expect(source).toContain('detail.remainingDays')
    expect(source).toContain('detail.remainingRatio')
    expect(source).toContain('advanceReminderRuleItems')
    expect(source).toContain('overdueReminderRuleItems')
    expect(source).toContain('listReminderRuleDescriptions')
    expect(source).toContain('type="info"')
    expect(source).toContain('type="warning"')
  })
})
