const WEBSITE_URL_ERROR_MESSAGE = '请输入合法网址，例如 https://example.com'
const FQDN_LABEL_RE = /^[a-z_\u00a1-\uffff0-9-]+$/i
const FQDN_TLD_RE = /^([a-z\u00A1-\u00A8\u00AA-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]{2,}|xn[a-z0-9-]{2,})$/i
const FULL_WIDTH_RE = /[\uff01-\uff5e]/
const IPV4_SEGMENT = '(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])'
const IPV4_RE = new RegExp(`^(?:${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT}$`)
const IPV6_SEGMENT = '(?:[0-9a-fA-F]{1,4})'
const IPV6_RE = new RegExp(
  '^(' +
    `(?:${IPV6_SEGMENT}:){7}(?:${IPV6_SEGMENT}|:)|` +
    `(?:${IPV6_SEGMENT}:){6}(?:(${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT}|:${IPV6_SEGMENT}|:)|` +
    `(?:${IPV6_SEGMENT}:){5}(?:(:(${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT})|(:${IPV6_SEGMENT}){1,2}|:)|` +
    `(?:${IPV6_SEGMENT}:){4}(?:(:${IPV6_SEGMENT}){0,1}:((${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT})|(:${IPV6_SEGMENT}){1,3}|:)|` +
    `(?:${IPV6_SEGMENT}:){3}(?:(:${IPV6_SEGMENT}){0,2}:((${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT})|(:${IPV6_SEGMENT}){1,4}|:)|` +
    `(?:${IPV6_SEGMENT}:){2}(?:(:${IPV6_SEGMENT}){0,3}:((${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT})|(:${IPV6_SEGMENT}){1,5}|:)|` +
    `(?:${IPV6_SEGMENT}:){1}(?:(:${IPV6_SEGMENT}){0,4}:((${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT})|(:${IPV6_SEGMENT}){1,6}|:)|` +
    `(?::((?::${IPV6_SEGMENT}){0,5}:((${IPV4_SEGMENT}[.]){3}${IPV4_SEGMENT})|(?::${IPV6_SEGMENT}){1,7}|:))` +
    ')(%[0-9a-zA-Z.]{1,})?$'
)

export function normalizeWebsiteUrlInput(input: string | null | undefined): {
  value: string | null
  error: string | null
} {
  if (input === null || input === undefined) {
    return { value: null, error: null }
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return { value: null, error: null }
  }

  const normalized = normalizeWebsiteUrlString(trimmed)
  if (!normalized) {
    return { value: null, error: WEBSITE_URL_ERROR_MESSAGE }
  }

  return { value: normalized, error: null }
}

function normalizeWebsiteUrlString(input: string): string | null {
  const parsedDirect = safelyParseHttpUrl(input)
  if (parsedDirect && isTrustedHostname(parsedDirect.hostname)) {
    return formatWebsiteUrl(parsedDirect)
  }

  if (input.includes('://') || /\s/.test(input)) {
    return null
  }

  const parsedWithHttps = safelyParseHttpUrl(`https://${input}`)
  return parsedWithHttps && isTrustedHostname(parsedWithHttps.hostname) ? formatWebsiteUrl(parsedWithHttps) : null
}

function safelyParseHttpUrl(input: string): URL | null {
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url
  } catch {
    return null
  }
}

function isTrustedHostname(hostname: string): boolean {
  if (!hostname) return false
  const normalized = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname

  if (normalized.toLowerCase() === 'localhost') {
    return true
  }

  const bracketless = normalized.startsWith('[') && normalized.endsWith(']') ? normalized.slice(1, -1) : normalized
  if (IPV4_RE.test(bracketless) || IPV6_RE.test(bracketless)) {
    return true
  }

  const parts = normalized.split('.')
  if (parts.length < 2) {
    return false
  }

  const tld = parts[parts.length - 1]
  if (!FQDN_TLD_RE.test(tld) || /\s/.test(tld) || /^\d+$/.test(tld)) {
    return false
  }

  return parts.every((part) => {
    if (!part || part.length > 63) return false
    if (!FQDN_LABEL_RE.test(part)) return false
    if (FULL_WIDTH_RE.test(part)) return false
    if (/^-|-$/.test(part)) return false
    return true
  })
}

function formatWebsiteUrl(url: URL): string {
  const href = url.toString()
  if (url.pathname === '/' && !url.search && !url.hash) {
    return href.replace(/\/$/, '')
  }
  return href
}
