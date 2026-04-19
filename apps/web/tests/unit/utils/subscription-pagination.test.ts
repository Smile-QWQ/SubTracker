import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SUBSCRIPTION_PAGE_SIZE,
  SUBSCRIPTION_PAGE_SIZE_STORAGE_KEY,
  getStoredSubscriptionPageSize,
  normalizeSubscriptionPageSize,
  setStoredSubscriptionPageSize
} from '../../../src/utils/subscription-pagination'

describe('subscription pagination utils', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        clear: () => {
          storage.clear()
        }
      }
    })
  })

  it('normalizes unsupported values to the default page size', () => {
    expect(normalizeSubscriptionPageSize(undefined)).toBe(DEFAULT_SUBSCRIPTION_PAGE_SIZE)
    expect(normalizeSubscriptionPageSize(5)).toBe(DEFAULT_SUBSCRIPTION_PAGE_SIZE)
    expect(normalizeSubscriptionPageSize('abc')).toBe(DEFAULT_SUBSCRIPTION_PAGE_SIZE)
  })

  it('stores and reads page size from localStorage', () => {
    setStoredSubscriptionPageSize(50)

    expect(storage.get(SUBSCRIPTION_PAGE_SIZE_STORAGE_KEY)).toBe('50')
    expect(getStoredSubscriptionPageSize()).toBe(50)
  })

  it('falls back to the default page size when storage is invalid', () => {
    storage.set(SUBSCRIPTION_PAGE_SIZE_STORAGE_KEY, '5')

    expect(getStoredSubscriptionPageSize()).toBe(DEFAULT_SUBSCRIPTION_PAGE_SIZE)
  })
})
