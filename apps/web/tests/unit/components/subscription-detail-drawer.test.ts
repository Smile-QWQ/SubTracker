import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { NDescriptionsItem } from 'naive-ui'
import SubscriptionDetailDrawer from '@/components/SubscriptionDetailDrawer.vue'
import { t } from '@/locales'
import type { SubscriptionDetail } from '@/types/api'

vi.mock('@/composables/api', () => ({ api: { getSubscriptionImages: vi.fn().mockResolvedValue([]) } }))

vi.mock('@/composables/settings-query', () => ({ useSettingsQuery: () => ({ data: { value: { timezone: 'UTC' } } }) }))

describe('subscription detail drawer remaining value', () => {
  it('hides recurring metrics and reminder settings for lifetime records', async () => {
    const detail: SubscriptionDetail = {
      id: 'lifetime', name: 'License', description: '', notes: '', status: 'active',
      billingType: 'lifetime', amount: 99, currency: 'USD', billingIntervalCount: 1, billingIntervalUnit: 'month',
      autoRenew: false, webhookEnabled: false, notifyDaysBefore: 0,
      startDate: '2026-01-01', nextRenewalDate: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      currentCycleStartDate: '2026-01-01', currentCycleEndDate: '2026-02-01', remainingDays: 0,
      remainingRatio: 0, remainingValue: 0, remainingValueCurrency: 'USD'
    }
    const wrapper = shallowMount(SubscriptionDetailDrawer, {
      props: { show: true, detail }, global: { renderStubDefaultSlot: true }
    })
    const recurringLabels = [
      'common.labels.autoRenew', 'subscriptions.labels.interval', 'common.labels.nextRenewal',
      'subscriptions.labels.currentCycle', 'subscriptions.labels.remainingValue',
      'subscriptions.labels.advanceReminders', 'subscriptions.labels.overdueReminders', 'common.labels.notifications'
    ].map((key) => t(key))
    let labels = wrapper.findAllComponents(NDescriptionsItem).map((item) => item.props('label'))
    for (const label of recurringLabels) expect(labels).not.toContain(label)
    expect(wrapper.text()).toContain(t('subscriptions.billingType.lifetime'))
    expect(labels).toContain(t('common.labels.startDate'))
    expect(labels).toContain(t('subscriptions.labels.originalAmount'))

    await wrapper.setProps({ detail: { ...detail, billingType: undefined } })
    labels = wrapper.findAllComponents(NDescriptionsItem).map((item) => item.props('label'))
    for (const label of recurringLabels) expect(labels).toContain(label)
    wrapper.unmount()
  })

  it('renders remaining value fields in detail drawer', () => {
    const source = readFileSync('src/components/SubscriptionDetailDrawer.vue', 'utf8')

    expect(source).toContain("t('subscriptions.labels.currentCycle')")
    expect(source).toContain("t('subscriptions.labels.remainingValue')")
    expect(source).toContain('detail.currentCycleStartDate')
    expect(source).toContain('detail.currentCycleEndDate')
    expect(source).toContain('detail.remainingValue')
    expect(source).toContain('detail.remainingDays')
    expect(source).toContain('detail.remainingRatio')
    expect(source).toContain('listReminderRuleDescriptions')
    expect(source).toContain('reminderRulesI18n')
    expect(source).toContain('detail-descriptions')
    expect(source).toContain('white-space: nowrap;')
    expect(source).toContain('detail-value-block')
    expect(source).toContain('detail-value-block__meta')
    expect(source).toContain(':label-style="middleAlignedCellStyle"')
    expect(source).toContain(':content-style="middleAlignedCellStyle"')
    expect(source).toContain("verticalAlign: 'middle'")
    expect(source).toContain(":label=\"t('common.labels.autoRenew')\"")
    expect(source).toContain(":label=\"t('common.labels.notifications')\"")
    expect(source).toContain('v-for="item in detail.tags ?? []"')
    expect(source).not.toContain('detailTagDisplay.overflowCount')
  })
})
