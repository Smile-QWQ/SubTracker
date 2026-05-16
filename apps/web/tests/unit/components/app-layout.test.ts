import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('app layout sidebar behavior', () => {
  it('keeps desktop sidebar fixed and menu independently scrollable', () => {
    const source = readFileSync('src/App.vue', 'utf8')
    const globalStyle = readFileSync('src/style.css', 'utf8')

    expect(source).toContain('content-style="overflow: visible;"')
    expect(source).toContain('class="desktop-sider"')
    expect(source).toContain('position: sticky;')
    expect(source).toContain('height: 100vh;')
    expect(source).toContain('overflow: visible;')
    expect(source).toContain('align-self: flex-start;')
    expect(source).toContain('overflow-y: auto;')
    expect(source).toContain('class="main-content"')
    expect(source).not.toContain('height: calc(100vh - 64px);')
    expect(source).not.toContain('.main-content :deep(.n-layout-scroll-container)')
    expect(globalStyle).toContain(":root[data-theme='dark']")
    expect(globalStyle).toContain('background: #111827;')
    expect(globalStyle).toContain('#app {')
    expect(globalStyle).toContain('background: var(--app-bg);')
    expect(source).toContain('brandLogoUrl')
    expect(source).toContain('versionUpdateModalVisible')
    expect(source).toContain('useVersionUpdateQuery')
    expect(source).toContain('openVersionUpdatePanel')
    expect(source).toContain('logo__update-dot')
    expect(source).toContain('版本更新')
    expect(source).not.toContain('/budgets')
    expect(source).not.toContain('预算统计')
    expect(source).not.toContain('enableTagBudgets')
  })
})
