import type { AppLocale } from './locale-core'
import { DEFAULT_APP_LOCALE, normalizeAppLocale, resolveAppLocaleFromAcceptLanguage } from './locale-core'
import zhCnMessages from './locales/zh-CN'
import enUsMessages from './locales/en-US'

type MessageValue = string | MessageTree
type MessageTree = {
  [key: string]: MessageValue
}

export type TranslationParams = Record<string, string | number | boolean | null | undefined>

export const sharedMessages = {
  'zh-CN': zhCnMessages,
  'en-US': enUsMessages
} as const satisfies Record<AppLocale, MessageTree>

export const SUPPORTED_APP_LOCALES = Object.freeze(Object.keys(sharedMessages) as AppLocale[])

function isMessageTree(value: MessageValue | undefined): value is MessageTree {
  return typeof value === 'object' && value !== null
}

function getNestedMessage(tree: MessageTree, key: string): string | undefined {
  const segments = key.split('.')
  let current: MessageValue | undefined = tree

  for (const segment of segments) {
    if (!isMessageTree(current)) return undefined
    current = current[segment]
  }

  return typeof current === 'string' ? current : undefined
}

function interpolateMessage(template: string, params?: TranslationParams) {
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

export function getMessage(locale: AppLocale, key: string, params?: TranslationParams) {
  const normalizedLocale = normalizeAppLocale(locale)
  const template =
    getNestedMessage(sharedMessages[normalizedLocale], key) ??
    getNestedMessage(sharedMessages[DEFAULT_APP_LOCALE], key) ??
    key

  return interpolateMessage(template, params)
}

export function detectLocaleFromAcceptLanguage(value: unknown, fallback: AppLocale = DEFAULT_APP_LOCALE) {
  return resolveAppLocaleFromAcceptLanguage(value, fallback)
}

export function getDefaultAiSubscriptionPrompt(locale: AppLocale = DEFAULT_APP_LOCALE) {
  return getMessage(locale, 'ai.prompts.subscription.default')
}

export function getDefaultAiDashboardSummaryPrompt(locale: AppLocale = DEFAULT_APP_LOCALE) {
  return getMessage(locale, 'ai.prompts.dashboard.summary.default')
}

export function getDefaultAiDashboardSummaryPreviewPrompt(locale: AppLocale = DEFAULT_APP_LOCALE) {
  return getMessage(locale, 'ai.prompts.dashboard.preview.default')
}

export const DEFAULT_AI_SUBSCRIPTION_PROMPT = getDefaultAiSubscriptionPrompt(DEFAULT_APP_LOCALE)
export const DEFAULT_AI_DASHBOARD_SUMMARY_PROMPT = getDefaultAiDashboardSummaryPrompt(DEFAULT_APP_LOCALE)
export const DEFAULT_AI_DASHBOARD_SUMMARY_PREVIEW_PROMPT = getDefaultAiDashboardSummaryPreviewPrompt(DEFAULT_APP_LOCALE)
