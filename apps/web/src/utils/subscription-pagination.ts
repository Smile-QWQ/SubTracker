export const SUBSCRIPTION_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export const DEFAULT_SUBSCRIPTION_PAGE_SIZE = SUBSCRIPTION_PAGE_SIZE_OPTIONS[0]
export const SUBSCRIPTION_PAGE_SIZE_STORAGE_KEY = 'subtracker.subscriptionPageSize'

export function normalizeSubscriptionPageSize(value?: number | string | null) {
  const numeric = Number(value)
  return SUBSCRIPTION_PAGE_SIZE_OPTIONS.includes(numeric as (typeof SUBSCRIPTION_PAGE_SIZE_OPTIONS)[number])
    ? numeric
    : DEFAULT_SUBSCRIPTION_PAGE_SIZE
}

export function getStoredSubscriptionPageSize() {
  if (typeof window === 'undefined') return DEFAULT_SUBSCRIPTION_PAGE_SIZE
  return normalizeSubscriptionPageSize(window.localStorage.getItem(SUBSCRIPTION_PAGE_SIZE_STORAGE_KEY))
}

export function setStoredSubscriptionPageSize(value: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SUBSCRIPTION_PAGE_SIZE_STORAGE_KEY, String(normalizeSubscriptionPageSize(value)))
}
