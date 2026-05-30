import type { FastifyRequest } from 'fastify'
import {
  DEFAULT_APP_LOCALE,
  type AppLocale,
  resolveAppLocaleFromAcceptLanguage
} from '@subtracker/shared/locale-core'
import { getMessage } from '@subtracker/shared/i18n'

export type TranslateOptions = {
  locale?: AppLocale
  params?: Record<string, string | number | boolean | null | undefined>
}

export function detectRequestLocale(request: Pick<FastifyRequest, 'headers'>, fallbackLocale = DEFAULT_APP_LOCALE): AppLocale {
  const localeHeader = request.headers['x-subtracker-locale']
  if (typeof localeHeader === 'string' && localeHeader.trim()) {
    return resolveAppLocaleFromAcceptLanguage(localeHeader, fallbackLocale)
  }

  const acceptLanguage = request.headers['accept-language']
  return resolveAppLocaleFromAcceptLanguage(acceptLanguage, fallbackLocale)
}

export function translateMessage(messageKey: string, options?: TranslateOptions) {
  return getMessage(options?.locale ?? DEFAULT_APP_LOCALE, messageKey, options?.params)
}

export function translateErrorMessage(messageKey: string, options?: TranslateOptions) {
  return translateMessage(messageKey, options)
}

function translateErrorDetailValue(value: unknown, options?: TranslateOptions): unknown {
  if (typeof value === 'string') {
    const translated = translateMessage(value, options)
    return translated === value ? value : translated
  }

  if (Array.isArray(value)) {
    return value.map((item) => translateErrorDetailValue(item, options))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, translateErrorDetailValue(child, options)])
    )
  }

  return value
}

export function translateErrorDetails(details: unknown, options?: TranslateOptions) {
  return translateErrorDetailValue(details, options)
}
