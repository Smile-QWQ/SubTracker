import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui'
import {
  DEFAULT_APP_LOCALE,
  LOCALE_PREFERENCE_STORAGE_KEY,
  getDefaultAiDashboardSummaryPrompt,
  getDefaultAiSubscriptionPrompt,
  normalizeAppLocale,
  sharedMessages,
  type AppLocale
} from '@subtracker/shared'

const messages = sharedMessages

function readStoredLocalePreference(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_APP_LOCALE

  const stored = window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)
  if (stored) {
    return normalizeAppLocale(stored, DEFAULT_APP_LOCALE)
  }

  return normalizeAppLocale(window.navigator.language, DEFAULT_APP_LOCALE)
}

const localeRef = ref<AppLocale>(readStoredLocalePreference())

export const i18n = createI18n({
  legacy: false,
  locale: localeRef.value,
  fallbackLocale: DEFAULT_APP_LOCALE,
  messages
})

function syncLocale(locale: AppLocale) {
  localeRef.value = locale
  i18n.global.locale.value = locale
}

function persistLocalePreference(locale: AppLocale) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, locale)
  }
}

export function setAppLocale(locale: AppLocale) {
  const normalized = normalizeAppLocale(locale, DEFAULT_APP_LOCALE)
  syncLocale(normalized)
  persistLocalePreference(normalized)
}

export function hydrateAppLocale(locale: AppLocale) {
  const normalized = normalizeAppLocale(locale, DEFAULT_APP_LOCALE)
  syncLocale(normalized)
  persistLocalePreference(normalized)
}

export function useAppLocale() {
  const naiveLocale = computed(() => (localeRef.value === 'en-US' ? enUS : zhCN))
  const naiveDateLocale = computed(() => (localeRef.value === 'en-US' ? dateEnUS : dateZhCN))

  return {
    locale: computed(() => localeRef.value),
    naiveLocale,
    naiveDateLocale,
    setLocale: setAppLocale
  }
}

export function getAppLocale() {
  return localeRef.value
}

export function t(key: string, params?: Record<string, unknown>) {
  // Ensure callers that use this shared wrapper inside template/computed/render
  // establish a reactive dependency on the current locale.
  localeRef.value
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
}

export function getDefaultAiPromptByLocale() {
  return getDefaultAiSubscriptionPrompt(localeRef.value)
}

export function getDefaultAiSummaryPromptByLocale() {
  return getDefaultAiDashboardSummaryPrompt(localeRef.value)
}
