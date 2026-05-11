import { beforeEach, describe, expect, it } from 'vitest'
import { setAppLocale, t } from '@/locales'

describe('locale translation reactivity', () => {
  beforeEach(() => {
    setAppLocale('zh-CN')
  })

  it('returns updated translation after switching locale', () => {
    expect(t('app.shellTitle')).toBe('订阅管理台')

    setAppLocale('en-US')
    expect(t('app.shellTitle')).toBe('Subscription Console')

    setAppLocale('zh-CN')
    expect(t('app.shellTitle')).toBe('订阅管理台')
  })
})
