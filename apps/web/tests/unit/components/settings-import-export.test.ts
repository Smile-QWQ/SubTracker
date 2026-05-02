import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('settings import export copy', () => {
  it('shows backup and migration sections without legacy csv/json export copy', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')
    const backupModal = readFileSync('src/components/SubtrackerBackupModal.vue', 'utf8')

    expect(source).toContain('title="导入和导出"')
    expect(source).toContain('embedded title="备份"')
    expect(source).toContain('导出备份')
    expect(source).toContain('恢复备份')
    expect(source).toContain('embedded title="迁移"')
    expect(source).toContain('从第三方同类项目导入数据')
    expect(source).toContain('导入 Wallos')
    expect(source).toContain('支持通过 ZIP 进行导出备份与恢复备份')
    expect(source).toContain('当前运行环境为 Cloudflare Worker + D1')
    expect(source).not.toContain('导出 CSV')
    expect(source).not.toContain('导出 JSON')
    expect(source).not.toContain('支持通过 ZIP 进行导出和导入')
    expect(source).not.toContain('当前运行时：Cloudflare Worker + D1。')
    expect(source).not.toContain('从第三方同类项目导入数据。')
    expect(backupModal).toContain('title="恢复备份"')
    expect(backupModal).not.toContain('title="导入 ZIP"')
    expect(backupModal).toContain('预览备份')
    expect(backupModal).toContain('确认恢复')
    expect(backupModal).not.toContain('确认导入')
  })
})
