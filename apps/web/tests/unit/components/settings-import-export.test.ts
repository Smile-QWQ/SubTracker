import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('settings import export section', () => {
  it('uses neutral import/export wording for backup zip section', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')
    const backupModal = readFileSync('src/components/SubtrackerBackupModal.vue', 'utf8')

    expect(source).toContain("t('settings.sections.importExport')")
    expect(source).toContain("t('settings.sections.backup')")
    expect(source).toContain("t('settings.sections.migration')")
    expect(source).toContain("t('settings.buttons.exportBackup')")
    expect(source).toContain("t('settings.buttons.restoreBackup')")
    expect(source).toContain("t('settings.helps.backup')")
    expect(source).toContain("t('settings.helps.migration')")
    expect(source).toContain("t('settings.buttons.importWallos')")
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

    expect(backupModal).toContain("t('subscriptions.backupModal.title')")
    expect(backupModal).toContain("t('subscriptions.backupModal.previewBackup')")
    expect(backupModal).toContain("t('subscriptions.backupModal.confirmRestore')")
    expect(backupModal).toContain("t('subscriptions.backupModal.restoreMode')")
    expect(backupModal).toContain("t('subscriptions.backupModal.restorePreview')")
    expect(backupModal).toContain("t('subscriptions.backupModal.invalidZip')")
    expect(backupModal).toContain("t('subscriptions.backupModal.nothingImported')")
    expect(backupModal).toContain("t('subscriptions.backupModal.appendHelp')")
    expect(backupModal).toContain("t('subscriptions.backupModal.existingSubscriptions')")
    expect(backupModal).toContain("t('subscriptions.backupModal.existingPaymentRecords')")
    expect(backupModal).not.toContain('title="导入 ZIP"')
    expect(backupModal).not.toContain('生成预览')
    expect(backupModal).not.toContain('确认导入')
  })

  it('expands ai settings wording from recognition-only to shared ai capability', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).toContain("t('settings.sections.ai')")
    expect(source).toContain("t('settings.labels.enableAi')")
    expect(source).toContain("t('settings.labels.aiSummary')")
    expect(source).toContain("t('settings.helps.aiSettings')")
    expect(source).toContain("t('settings.labels.customRecognitionPrompt')")
    expect(source).toContain("t('settings.labels.customSummaryPrompt')")
    expect(source).not.toContain('title="AI 识别设置"')
    expect(source).not.toContain('启用 AI 识别')
  })

  it('adds an about section at the end of settings', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).toContain("t('settings.sections.about')")
    expect(source).toContain("t('settings.sections.credits')")
    expect(source).toContain("t('settings.about.releaseNotes')")
    expect(source).toContain('GPLv3')
    expect(source).toContain("t('settings.about.issues')")
    expect(source).toContain("t('settings.about.author')")
    expect(source).toContain("t('settings.about.credits.wallos')")
    expect(source).toContain("t('settings.about.credits.vueVite')")
    expect(source).toContain("t('settings.about.credits.naiveUi')")
  })

  it('adds forgot-password switch to credentials settings', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).toContain("t('settings.sections.credentials')")
    expect(source).toContain("t('settings.labels.enableForgotPassword')")
    expect(source).toContain('settingsForm.forgotPasswordEnabled')
    expect(source).toContain('forgotPasswordToggleUnlocked')
    expect(source).toContain('savingForgotPasswordToggle')
    expect(source).toContain('handleForgotPasswordToggleChange')
    expect(source).toContain("t('settings.helps.forgotPasswordChannelRequired')")
    expect(source).toContain("@update:value=\"handleForgotPasswordToggleChange\"")
    expect(source).toContain('switch-group switch-group--single')
    expect(source).toContain('switch-inline-label')
    expect(source).toContain("t('settings.labels.newPassword')")
    expect(source).toContain('<n-space class="settings-actions" style="margin-top: 12px">')
    expect(source).toContain("t('common.actions.update')")
    expect(source).not.toContain('label="找回密码说明"')
    expect(source).not.toContain('forgotPasswordHintText')
    expect(source).not.toContain('label="忘记密码"')
  })

  it('does not expose a separate locale selector in SettingsPage anymore', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).not.toContain('systemDefaultLocale')
    expect(source).not.toContain("t('settings.labels.systemDefaultLocale')")
    expect(source).not.toContain("t('settings.labels.interfaceLocale')")
    expect(source).not.toContain('localeOptions')
  })

  it('allows custom bark server urls without requiring a separate device key', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).toContain('function isBarkCustomServerUrl')
    expect(source).toContain("const parsed = new URL(serverUrl.trim())")
    expect(source).toContain("parsed.pathname.replace(/\\/+$/, '') !== ''")
    expect(source).toContain("if (!isBarkCustomServerUrl(settingsForm.barkConfig.serverUrl))")
  })
})
