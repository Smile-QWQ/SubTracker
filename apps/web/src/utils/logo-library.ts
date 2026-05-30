import type { LogoSearchResult } from '@/types/api'

export function filterLocalLogoLibrary(items: LogoSearchResult[], keyword: string): LogoSearchResult[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) {
    return items
  }

  return items.filter((item) => {
    const haystacks = [
      item.label,
      item.source,
      item.filename,
      item.websiteUrl,
      ...(item.relatedSubscriptionNames ?? [])
    ]

    return haystacks.some((value) => String(value ?? '').toLowerCase().includes(normalizedKeyword))
  })
}
