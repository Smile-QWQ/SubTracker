import { describe, expect, it } from 'vitest'
import { formatSubscriptionTagOverflowTooltip, splitSubscriptionTagsForDisplay } from '@/utils/subscription-tags'

describe('subscription tags helpers', () => {
  const tags = Array.from({ length: 8 }, (_, index) => ({
    id: `tag-${index + 1}`,
    name: `标签 ${index + 1}`,
    color: '#000000',
    icon: 'apps-outline',
    sortOrder: index
  }))

  it('caps visible tags and returns overflow tags', () => {
    const result = splitSubscriptionTagsForDisplay(tags)

    expect(result.visible).toHaveLength(6)
    expect(result.overflow).toHaveLength(2)
    expect(result.overflowCount).toBe(2)
  })

  it('formats overflow tooltip text', () => {
    expect(formatSubscriptionTagOverflowTooltip(tags.slice(6))).toBe('标签 7 / 标签 8')
  })
})
