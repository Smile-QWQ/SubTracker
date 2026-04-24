import { computed, ref } from 'vue'
import { usePreferredDark } from '@vueuse/core'

export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_PREFERENCE_STORAGE_KEY = 'subtracker-theme-preference'

function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  return normalizeThemePreference(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY))
}

const themePreferenceRef = ref<ThemePreference>(readStoredThemePreference())

export function useThemePreference() {
  const preferredDark = usePreferredDark()
  const resolvedTheme = computed<'light' | 'dark'>(() =>
    themePreferenceRef.value === 'system' ? (preferredDark.value ? 'dark' : 'light') : themePreferenceRef.value
  )

  function setThemePreference(value: ThemePreference) {
    const normalized = normalizeThemePreference(value)
    themePreferenceRef.value = normalized
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, normalized)
    }
  }

  return {
    themePreference: themePreferenceRef,
    resolvedTheme,
    setThemePreference
  }
}
