import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('version update query', () => {
  it('defines the version update query key and currentVersion-bound query', () => {
    const source = readFileSync('src/composables/version-update-query.ts', 'utf8')

    expect(source).toContain("export const VERSION_UPDATE_QUERY_KEY = ['version-updates'] as const")
    expect(source).toContain('queryKey: [...VERSION_UPDATE_QUERY_KEY, currentVersion]')
    expect(source).toContain('api.getVersionUpdates(currentVersion)')
    expect(source).toContain('enabled: Boolean(currentVersion)')
  })
})
