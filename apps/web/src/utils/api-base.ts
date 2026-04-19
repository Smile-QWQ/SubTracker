export function getApiBaseUrl(configuredBase?: string | null) {
  const trimmed = configuredBase?.trim()
  return trimmed ? trimmed : '/api/v1'
}

function getBrowserOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return explicitOrigin
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost'
}

export function resolveApiOrigin(configuredBase?: string | null, browserOrigin?: string) {
  const base = getApiBaseUrl(configuredBase)
  const origin = getBrowserOrigin(browserOrigin)
  const absoluteBase = /^https?:\/\//i.test(base) ? base : new URL(base, origin).toString()
  return absoluteBase.replace(/\/api\/v1\/?$/, '')
}

export function resolveAssetUrl(url?: string | null, configuredBase?: string | null, browserOrigin?: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url

  return new URL(url, `${resolveApiOrigin(configuredBase, browserOrigin)}/`).toString()
}
