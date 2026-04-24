import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const preferredDark = ref(false)

vi.mock('@vueuse/core', () => ({
  usePreferredDark: () => preferredDark
}))

describe('useThemePreference', () => {
  beforeEach(() => {
    localStorage.clear()
    preferredDark.value = false
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists an explicit theme preference', async () => {
    const { useThemePreference } = await import('@/composables/theme-preference')
    const { themePreference, resolvedTheme, setThemePreference } = useThemePreference()

    expect(themePreference.value).toBe('system')
    expect(resolvedTheme.value).toBe('light')

    setThemePreference('dark')

    expect(themePreference.value).toBe('dark')
    expect(resolvedTheme.value).toBe('dark')
    expect(localStorage.getItem('subtracker-theme-preference')).toBe('dark')
  })

  it('falls back to system and follows preferred dark mode', async () => {
    localStorage.setItem('subtracker-theme-preference', 'invalid')
    preferredDark.value = true

    const { useThemePreference } = await import('@/composables/theme-preference')
    const { themePreference, resolvedTheme } = useThemePreference()

    expect(themePreference.value).toBe('system')
    expect(resolvedTheme.value).toBe('dark')
  })
})
