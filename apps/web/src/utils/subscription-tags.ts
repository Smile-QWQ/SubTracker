import type { Tag } from '@/types/api'

export const SUBSCRIPTION_TAG_DISPLAY_LIMIT = 6

export type SubscriptionTagDisplay = {
  visible: Tag[]
  overflow: Tag[]
  overflowCount: number
}

export function splitSubscriptionTagsForDisplay(tags?: Tag[] | null, limit = SUBSCRIPTION_TAG_DISPLAY_LIMIT): SubscriptionTagDisplay {
  const list = tags ?? []
  const safeLimit = Math.max(0, limit)
  const visible = list.slice(0, safeLimit)
  const overflow = list.slice(safeLimit)

  return {
    visible,
    overflow,
    overflowCount: overflow.length
  }
}

export function formatSubscriptionTagOverflowTooltip(tags: Tag[]) {
  return tags.map((tag) => tag.name).join(' / ')
}
