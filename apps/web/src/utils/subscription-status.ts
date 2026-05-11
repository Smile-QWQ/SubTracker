import type { SubscriptionStatus } from '@/types/api'
import { t } from '@/locales'

export function getSubscriptionStatusText(status: SubscriptionStatus | string) {
  switch (status) {
    case 'active':
      return t('subscriptions.status.active')
    case 'paused':
      return t('subscriptions.status.paused')
    case 'cancelled':
      return t('subscriptions.status.cancelled')
    case 'expired':
      return t('subscriptions.status.expired')
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
