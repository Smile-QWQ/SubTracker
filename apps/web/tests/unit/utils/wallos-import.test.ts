import { describe, expect, it } from 'vitest'
import { setAppLocale } from '@/locales'
import { getJsonImportWarningMessage, shouldRecommendDbImport } from '../../../src/utils/wallos-import'

describe('wallos import ui helpers', () => {
  it('recommends db import for json file selection or json preview type', () => {
    expect(shouldRecommendDbImport('subscriptions.json')).toBe(true)
    expect(shouldRecommendDbImport('wallos.db')).toBe(false)
    expect(shouldRecommendDbImport(null, 'json')).toBe(true)
    expect(shouldRecommendDbImport('subscriptions.zip', 'db')).toBe(false)
  })

  it('provides a stable warning message', () => {
    setAppLocale('zh-CN')
    const message = getJsonImportWarningMessage()
    expect(message).toContain('推荐优先使用 Wallos DB 导入')
    expect(message).toContain('JSON')
  })
})
