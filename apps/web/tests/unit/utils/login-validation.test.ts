import { describe, expect, it } from 'vitest'
import { setAppLocale } from '../../../src/locales'
import { validateLoginForm } from '../../../src/utils/login-validation'

describe('validateLoginForm', () => {
  it('requires both username and password', () => {
    setAppLocale('zh-CN')
    expect(validateLoginForm('', '')).toBe('请输入用户名和密码')
  })

  it('requires username', () => {
    setAppLocale('zh-CN')
    expect(validateLoginForm('', 'password')).toBe('请输入用户名')
  })

  it('requires password', () => {
    setAppLocale('zh-CN')
    expect(validateLoginForm('admin', '')).toBe('请输入密码')
  })

  it('passes when both fields are provided', () => {
    setAppLocale('zh-CN')
    expect(validateLoginForm('admin', 'password')).toBeNull()
  })
})
