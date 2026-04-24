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

export function validateNotificationTargetUrl(rawUrl: string, label = 'URL') {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`${label} 格式无效`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} 仅支持 http 或 https`)
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(`${label} 不允许指向本地或内网地址`)
  }

  return parsed
}
