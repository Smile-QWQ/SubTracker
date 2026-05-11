import type { FastifyRequest } from 'fastify'
import {
  DEFAULT_APP_LOCALE,
  getMessage,
  type AppLocale,
  resolveAppLocaleFromAcceptLanguage
} from '@subtracker/shared'

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
