import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('settings import export section', () => {
  it('uses neutral import/export wording for backup zip section', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).toContain('title="导入和导出"')
    expect(source).toContain('title="备份"')
    expect(source).toContain('title="迁移"')
    expect(source).toContain('导出备份')
    expect(source).toContain('恢复备份')
    expect(source).toContain('支持通过 ZIP 进行备份与恢复，包含订阅、标签、支付记录、排序、系统设置与本地 Logo')
    expect(source).toContain('从第三方同类项目导入数据')
    expect(source).toContain('导入 Wallos')
    expect(source).not.toContain('可在这里导入和导出数据。')
    expect(source).not.toContain('导出 CSV')
    expect(source).not.toContain('导出 JSON')
    expect(source).not.toContain('支持通过 ZIP 进行导出和导入')
    expect(source).not.toContain('从第三方同类项目导入数据。')
    expect(source).not.toContain('title="导入 Wallos"')
    expect(source).not.toContain('导出 ZIP')
    expect(source).not.toContain('导入 ZIP')
    expect(source).not.toContain('项目自身完整备份恢复')
    expect(source).not.toContain('业务完整恢复包')
  })
})
