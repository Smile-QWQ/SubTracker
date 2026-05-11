import { describe, expect, it } from 'vitest'
import type { Tag } from '../../../src/types/api'
import {
  SUBSCRIPTION_TAG_DISPLAY_LIMIT,
  formatSubscriptionTagOverflowTooltip,
  splitSubscriptionTagsForDisplay
} from '../../../src/utils/subscription-tags'

function createTag(index: number): Tag {
  return {
    id: `tag-${index}`,
    name: `标签-${index}`,
    color: '#2563eb',
    icon: '',
    sortOrder: index
  }
}

describe('subscription-tags utils', () => {
  it('returns all tags as visible when count does not exceed the display limit', () => {
    const tags = Array.from({ length: SUBSCRIPTION_TAG_DISPLAY_LIMIT }, (_, index) => createTag(index + 1))

    const result = splitSubscriptionTagsForDisplay(tags)

    expect(result.visible.map((tag) => tag.id)).toEqual(tags.map((tag) => tag.id))
    expect(result.overflow).toEqual([])
    expect(result.overflowCount).toBe(0)
  })

  it('keeps only the first six tags visible and moves the rest into overflow', () => {
    const tags = Array.from({ length: SUBSCRIPTION_TAG_DISPLAY_LIMIT + 3 }, (_, index) => createTag(index + 1))

    const result = splitSubscriptionTagsForDisplay(tags)

    expect(result.visible.map((tag) => tag.id)).toEqual(tags.slice(0, 6).map((tag) => tag.id))
    expect(result.overflow.map((tag) => tag.id)).toEqual(tags.slice(6).map((tag) => tag.id))
    expect(result.overflowCount).toBe(3)
    expect(formatSubscriptionTagOverflowTooltip(result.overflow)).toBe('标签-7 / 标签-8 / 标签-9')
  })

  it('treats missing tags as empty lists', () => {
    const result = splitSubscriptionTagsForDisplay(undefined)

    expect(result.visible).toEqual([])
    expect(result.overflow).toEqual([])
    expect(result.overflowCount).toBe(0)
  })
})
