import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('subscription detail drawer remaining value', () => {
  it('renders remaining value fields in detail drawer', () => {
    const source = readFileSync('src/components/SubscriptionDetailDrawer.vue', 'utf8')

    expect(source).toContain('label="当前周期"')
    expect(source).toContain('label="剩余价值"')
    expect(source).toContain('detail.currentCycleStartDate')
    expect(source).toContain('detail.currentCycleEndDate')
    expect(source).toContain('detail.remainingValue')
    expect(source).toContain('detail.remainingDays')
    expect(source).toContain('detail.remainingRatio')
    expect(source).toContain('listReminderRuleDescriptions')
    expect(source).toContain('detail-descriptions')
    expect(source).toContain('white-space: nowrap;')
    expect(source).toContain('detail-value-block')
    expect(source).toContain('detail-value-block__meta')
    expect(source).toContain(':label-style="middleAlignedCellStyle"')
    expect(source).toContain(':content-style="middleAlignedCellStyle"')
    expect(source).toContain("verticalAlign: 'middle'")
    expect(source).toContain('label="自动续订" :label-style="middleAlignedCellStyle" :content-style="middleAlignedCellStyle"')
    expect(source).toContain('label="提醒通知" :label-style="middleAlignedCellStyle" :content-style="middleAlignedCellStyle"')
    expect(source).toContain('v-for="item in detail.tags ?? []"')
    expect(source).not.toContain('detailTagDisplay.overflowCount')
  })
})
