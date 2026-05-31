import { describe, expect, it } from 'vitest'
import { getWallosJsonImportWarningMessage, shouldRecommendDbImport } from '../../../src/utils/wallos-import'

describe('wallos import ui helpers', () => {
  it('recommends db import for json file selection or json preview type', () => {
    expect(shouldRecommendDbImport('subscriptions.json')).toBe(true)
    expect(shouldRecommendDbImport('wallos.db')).toBe(false)
    expect(shouldRecommendDbImport(null, 'json')).toBe(true)
    expect(shouldRecommendDbImport('subscriptions.zip', 'db')).toBe(false)
  })

  it('provides a stable warning message', () => {
    const message = getWallosJsonImportWarningMessage()
    expect(message).toContain('Wallos')
    expect(message).toContain('JSON')
  })
})
