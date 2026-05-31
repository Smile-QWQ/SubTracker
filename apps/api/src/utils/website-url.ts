import { normalizeWebsiteUrlInput as normalizeSharedWebsiteUrlInput } from '@subtracker/shared'
import { DEFAULT_APP_LOCALE } from '@subtracker/shared/locale-core'

export function normalizeWebsiteUrlInput(input: string | null | undefined): {
  value: string | null
  error: string | null
} {
  return normalizeSharedWebsiteUrlInput(input, DEFAULT_APP_LOCALE)
}
