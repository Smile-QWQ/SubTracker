import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('login page forgot password', () => {
  it('contains forgot-password flow gated by forgotPasswordEnabled', () => {
    const source = readFileSync('src/pages/LoginPage.vue', 'utf8')

    expect(source).toContain("import brandLogoUrl from '@/assets/brand-logo.png'")
    expect(source).toContain('class="login-header__logo"')
    expect(source).toContain('v-if="forgotPasswordEnabled"')
    expect(source).toContain('忘记密码')
    expect(source).toContain('发送验证码')
    expect(source).toContain('验证码')
    expect(source).toContain('验证并重置密码')
    expect(source).toContain('api.requestForgotPasswordCode')
    expect(source).toContain('api.resetForgotPassword')
  })
})
