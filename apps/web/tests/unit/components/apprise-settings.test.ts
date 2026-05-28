import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('apprise settings source guards', () => {
  it('wires apprise settings and target management into SettingsPage', () => {
    const source = readFileSync('src/pages/SettingsPage.vue', 'utf8')

    expect(source).toContain("t('settings.channels.apprise')")
    expect(source).toContain('showAppriseTargetsModal')
    expect(source).toContain('handleAppriseTargetsSave')
    expect(source).toContain('handleAppriseTargetTest')
    expect(source).toContain('testAppriseNotificationWithPayload')
    expect(source).toContain("t('settings.apprise.summary.targets'")
    expect(source).toContain('<apprise-targets-modal')
  })

  it('keeps the Apprise target modal focused on address-list management', () => {
    const source = readFileSync('src/components/AppriseTargetsModal.vue', 'utf8')

    expect(source).toContain("t('settings.apprise.modal.title')")
    expect(source).toContain("emit('save', cloneTargets(draftTargets))")
    expect(source).toContain("emit('test-target'")
    expect(source).toContain('createTarget()')
    expect(source).toContain('apprise-target-card__controls')
    expect(source).toContain('apprise-target-card__buttons')
    expect(source).toContain("t('settings.apprise.modal.testHint')")
    expect(source).not.toContain('appriseTargetTags')
  })
})
