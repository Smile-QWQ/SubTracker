import { normalizeWebsiteUrlInput as normalizeSharedWebsiteUrlInput } from '@subtracker/shared'
import { getAppLocale } from '@/locales'

export function normalizeWebsiteUrlInput(input: string | null | undefined): {
  value: string | null
  error: string | null
} {
  return normalizeSharedWebsiteUrlInput(input, getAppLocale())
}
