import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { validateLoginForm } from '../../../src/utils/login-validation'
import { getAppLocale, setAppLocale } from '../../../src/locales'

const originalLocale = getAppLocale()

beforeEach(() => {
  setAppLocale('zh-CN')
})

afterAll(() => {
  setAppLocale(originalLocale)
})

describe('validateLoginForm', () => {
  it('requires both username and password', () => {
    expect(validateLoginForm('', '')).toBe('请输入用户名和密码')
  })

  it('requires username', () => {
    expect(validateLoginForm('', 'password')).toBe('请输入用户名')
  })

  it('requires password', () => {
    expect(validateLoginForm('admin', '')).toBe('请输入密码')
  })

  it('passes when both fields are provided', () => {
    expect(validateLoginForm('admin', 'password')).toBeNull()
  })
})
