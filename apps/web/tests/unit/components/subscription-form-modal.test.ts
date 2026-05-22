import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('subscription form modal frequency and local logo search', () => {
  it('keeps frequency quick picks while allowing custom positive integer input', () => {
    const source = readFileSync('src/components/SubscriptionFormModal.vue', 'utf8')

    expect(source).toContain('filterable')
    expect(source).toContain('tag')
    expect(source).toContain(':on-create="handleCreateFrequencyOption"')
    expect(source).toContain('buildFrequencyOptions(form.billingIntervalCount)')
    expect(source).toContain("message.warning(t('subscriptions.messages.invalidCustomFrequency'))")
  })

  it('adds search filtering to the local logo library tab', () => {
    const source = readFileSync('src/components/SubscriptionFormModal.vue', 'utf8')

    expect(source).toContain("v-model:value=\"localLogoSearchQuery\"")
    expect(source).toContain("t('subscriptions.form.logo.localSearchPlaceholder')")
    expect(source).toContain('filteredLocalLogoLibrary.length')
    expect(source).toContain('filterLocalLogoLibrary(localLogoLibrary.value, localLogoSearchQuery.value)')
    expect(source).toContain("t('subscriptions.form.logo.noLocalMatches')")
  })

  it('clears cached local logo library data when the modal closes so usage counts refresh on reopen', () => {
    const source = readFileSync('src/components/SubscriptionFormModal.vue', 'utf8')

    expect(source).toContain('watch(')
    expect(source).toContain('() => props.show')
    expect(source).toContain('localLogoLibrary.value = []')
  })
})
