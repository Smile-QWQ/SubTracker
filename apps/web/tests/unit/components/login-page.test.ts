import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('login page forgot password and branding', () => {
  it('renders forgot password flow and brand logo entry points', () => {
    const source = readFileSync('src/pages/LoginPage.vue', 'utf8')

    expect(source).toContain("import brandLogoUrl from '@/assets/brand-logo.png'")
    expect(source).toContain('forgotPasswordEnabled')
    expect(source).toContain('forgotPasswordVisible')
    expect(source).toContain("t('login.forgotPassword')")
    expect(source).toContain("t('login.sendCode')")
    expect(source).toContain("t('login.verifyAndResetPassword')")
    expect(source).toContain("t('login.title')")
    expect(source).toContain("t('login.subtitle')")
    expect(source).toContain('api.requestForgotPasswordCode')
    expect(source).toContain('api.resetForgotPassword')
  })
})
