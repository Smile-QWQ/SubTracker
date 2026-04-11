export function resolveLogoUrl(url?: string | null) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url

  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1'
  return new URL(url, base.replace(/\/api\/v1$/, '')).toString()
}
