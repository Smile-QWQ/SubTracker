import { resolveAssetUrl } from '@/utils/api-base'

export function resolveLogoUrl(url?: string | null) {
  return resolveAssetUrl(url, import.meta.env.VITE_API_BASE_URL)
}
