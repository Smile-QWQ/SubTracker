import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('version update brand surface', () => {
  it('wires sidebar brand to version update modal', () => {
    const source = readFileSync('src/App.vue', 'utf8')

    expect(source).toContain('useVersionUpdateQuery(appVersion)')
    expect(source).toContain('openVersionUpdatePanel')
    expect(source).toContain('versionUpdateModalVisible')
    expect(source).toContain('hasVersionUpdate')
    expect(source).toContain('查看 Commit')
    expect(source).toContain('暂无比当前版本更新的 lite 提交')
  })
})
