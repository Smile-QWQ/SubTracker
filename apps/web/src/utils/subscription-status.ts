import { getMessage } from '@subtracker/shared'
import type { SubscriptionStatus } from '@/types/api'
import { getAppLocale } from '@/locales'

export function getSubscriptionStatusText(status: SubscriptionStatus | string) {
  const locale = getAppLocale()
  switch (status) {
    case 'active':
      return getMessage(locale, 'common.status.active')
    case 'paused':
      return getMessage(locale, 'common.status.paused')
    case 'cancelled':
      return getMessage(locale, 'common.status.cancelled')
    case 'expired':
      return getMessage(locale, 'common.status.expired')
    default:
      return status
  }
}

export function getSubscriptionStatusTagType(status: SubscriptionStatus | string): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'cancelled':
    case 'expired':
      return 'error'
    default:
      return 'default'
  }
}
