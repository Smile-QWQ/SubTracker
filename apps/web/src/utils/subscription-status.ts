import type { SubscriptionStatus } from '@/types/api'

export function getSubscriptionStatusText(status: SubscriptionStatus | string) {
  switch (status) {
    case 'active':
      return '正常'
    case 'paused':
      return '暂停'
    case 'cancelled':
      return '停用'
    case 'expired':
      return '过期'
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
