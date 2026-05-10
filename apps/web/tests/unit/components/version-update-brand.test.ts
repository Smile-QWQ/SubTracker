import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('app layout version update brand indicator', () => {
  it('shows update dot and modal entry around the logo brand', () => {
    const source = readFileSync('src/App.vue', 'utf8')

    expect(source).toContain('useVersionUpdateQuery(appVersion)')
    expect(source).toContain('logo__brand-trigger')
    expect(source).toContain('logo__update-dot')
    expect(source).toContain('brandLogoUrl')
    expect(source).toContain('logo__image')
    expect(source).toContain('openVersionUpdatePanel')
    expect(source).toContain('title="版本更新"')
    expect(source).toContain('renderReleaseBody')
    expect(source).toContain('查看 Release')
  })
})
