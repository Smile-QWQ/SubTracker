import { z } from 'zod'

export const AppLocaleSchema = z.enum(['zh-CN', 'en-US'])
export type AppLocale = z.infer<typeof AppLocaleSchema>

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN'
export const LOCALE_PREFERENCE_STORAGE_KEY = 'subtracker-locale-preference'

const APP_LOCALE_ALIASES: Record<string, AppLocale> = {
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hans-cn': 'zh-CN',
  en: 'en-US',
  'en-us': 'en-US'
}

function tryNormalizeAppLocale(value: unknown): AppLocale | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const lower = normalized.toLowerCase()
  if (APP_LOCALE_ALIASES[lower]) {
    return APP_LOCALE_ALIASES[lower]
  }

  for (const [prefix, locale] of Object.entries(APP_LOCALE_ALIASES)) {
    if (lower.startsWith(`${prefix}-`)) {
      return locale
    }
  }

  return null
}

export function normalizeAppLocale(value: unknown, fallback: AppLocale = DEFAULT_APP_LOCALE): AppLocale {
  return tryNormalizeAppLocale(value) ?? fallback
}

export function resolveAppLocaleFromAcceptLanguage(value: unknown, fallback: AppLocale = DEFAULT_APP_LOCALE) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  for (const segment of raw.split(',')) {
    const candidate = segment.split(';')[0]?.trim()
    if (!candidate) continue
    const locale = tryNormalizeAppLocale(candidate)
    if (locale) {
      return locale
    }
  }

  return fallback
}
