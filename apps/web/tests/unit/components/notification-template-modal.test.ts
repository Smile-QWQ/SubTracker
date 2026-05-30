import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('notification template modal preview locale behavior', () => {
  it('builds preview sample blocks from locale-aware labels instead of hardcoded chinese copy', () => {
    const source = readFileSync('src/components/NotificationTemplatesModal.vue', 'utf8')

    expect(source).toContain("t('common.labels.name')")
    expect(source).toContain("t('common.labels.nextRenewal')")
    expect(source).toContain("t('notifications.tests.intro')")
    expect(source).toContain("t('notifications.forgotPassword.ignoreHint')")
    expect(source).toContain('buildPreviewSample()')
    expect(source).not.toContain('<strong>名称</strong>：Netflix')
    expect(source).not.toContain('这是一条测试通知，用于验证当前通知渠道和模板配置。')
  })
})
