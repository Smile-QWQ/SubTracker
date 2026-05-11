import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('login page forgot password', () => {
  it('contains forgot-password flow gated by forgotPasswordEnabled', () => {
    const source = readFileSync('src/pages/LoginPage.vue', 'utf8')

    expect(source).toContain("import brandLogoUrl from '@/assets/brand-logo.png'")
    expect(source).toContain('class="login-header__logo"')
    expect(source).toContain('v-if="forgotPasswordEnabled"')
    expect(source).toContain("t('login.forgotPassword')")
    expect(source).toContain("t('login.sendCode')")
    expect(source).toContain("t('common.labels.code')")
    expect(source).toContain("t('login.verifyAndResetPassword')")
    expect(source).toContain('api.getAppLocale')
    expect(source).toContain('hydrateAppLocale(localeResponse.locale)')
    expect(source).toContain('api.requestForgotPasswordCode')
    expect(source).toContain('api.resetForgotPassword')
  })
})
