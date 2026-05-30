import { DEFAULT_APP_LOCALE, getMessage, type AppLocale } from '@subtracker/shared'

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  if (['localhost', '0.0.0.0', '::1'].includes(normalized) || normalized.endsWith('.local')) return true

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const [a, b] = normalized.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true
  return false
}

type NotificationTargetUrlOptions =
  | string
  | {
      label?: string
      locale?: AppLocale
      allowPrivateHost?: boolean
    }

export function validateNotificationTargetUrl(rawUrl: string, options: NotificationTargetUrlOptions = {}) {
  const normalizedOptions = typeof options === 'string' ? { label: options } : options
  const locale = normalizedOptions.locale ?? DEFAULT_APP_LOCALE
  const label = normalizedOptions.label ?? getMessage(locale, 'common.labels.url')
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(getMessage(locale, 'validation.notificationTargetUrl.invalidFormat', { label }))
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(getMessage(locale, 'validation.notificationTargetUrl.unsupportedProtocol', { label }))
  }

  if (!normalizedOptions.allowPrivateHost && isPrivateHostname(parsed.hostname)) {
    throw new Error(getMessage(locale, 'validation.notificationTargetUrl.privateHostBlocked', { label }))
  }

  return parsed
}
