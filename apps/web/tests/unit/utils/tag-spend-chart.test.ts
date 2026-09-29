import { describe, expect, it } from 'vitest'
import { buildTagSpendOption } from '@/utils/tag-spend-chart'
import { t } from '@/locales'

const theme = { cardColor: '#fff', borderColor: '#ddd', textColor2: '#333' }

describe('tag spending chart', () => {
  it('keeps one pie and shows monthly, annual and share values on hover or click', () => {
    const option = buildTagSpendOption(
      [{ name: 'Tools', value: 10 }, { name: 'Cloud', value: 30 }],
      [{ name: 'Cloud', value: 360 }, { name: 'Tools', value: 120.04 }], 'USD', theme
    )!
    expect(option.series).toHaveLength(1)
    expect(option.tooltip).toMatchObject({ triggerOn: 'mousemove|click', confine: true })
    const tip = option.tooltip.formatter({ dataIndex: 0 })
    expect(tip.textContent).toContain('Tools')
    expect(tip.textContent).toContain(`${t('dashboard.tagSpend.monthly')}: USD 10.00`)
    expect(tip.textContent).toContain(`${t('dashboard.tagSpend.yearly')}: USD 120.04`)
    expect(tip.textContent).toContain('25.00%')
  })

  it('renders untrusted tag names and currencies as text rather than HTML', () => {
    const name = '<img src=x onerror=alert(1)>'
    const tip = buildTagSpendOption([{ name, value: 1 }], undefined, '<svg>', theme)!.tooltip.formatter({ dataIndex: 0 })
    expect(tip.textContent).toContain(name)
    expect(tip.querySelector('img, svg')).toBeNull()
  })

  it('handles empty data, zero spend and missing yearly data', () => {
    expect(buildTagSpendOption([], [], 'CNY', theme)).toBeNull()
    expect(buildTagSpendOption(undefined, undefined, 'CNY', theme)).toBeNull()
    const option = buildTagSpendOption([{ name: 'Free', value: 0 }], undefined, 'CNY', theme)!
    expect(option.tooltip.formatter({ dataIndex: 0 }).textContent).toContain('0.00%')
    expect(option.tooltip.formatter({ dataIndex: 5 }).textContent).toBe('')
    const fallback = buildTagSpendOption([{ name: 'Tools', value: 2 }], undefined, 'CNY', theme)!
    expect(fallback.tooltip.formatter({ dataIndex: 0 }).textContent).toContain('CNY 24.00')
  })
})
