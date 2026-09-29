import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { NButton, NDatePicker, NFormItem, NInput, NInputNumber, NModal, NSelect, NSwitch } from 'naive-ui'
import SubscriptionFormModal from '@/components/SubscriptionFormModal.vue'
import { api } from '@/composables/api'
import { t } from '@/locales'
import type { Subscription } from '@/types/api'
import { buildSubscriptionCopyDraft } from '@/utils/subscription-form'

const settings = ref<{ baseCurrency: string; timezone: string }>()
const messages = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/composables/settings-query', () => ({ useSettingsQuery: () => ({ data: settings }) }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => messages }))
vi.mock('@/composables/api', () => ({ api: {
  importSubscriptionLogo: vi.fn(),
  uploadSubscriptionLogo: vi.fn(),
  getSubscriptionLogoLibrary: vi.fn().mockResolvedValue([]),
  searchSubscriptionLogos: vi.fn().mockResolvedValue([])
} }))

const original: Subscription = {
  id: 'original', name: 'Example', description: 'Description', amount: 49, currency: 'USD',
  billingIntervalCount: 2, billingIntervalUnit: 'year', autoRenew: true,
  startDate: '2026-01-01', nextRenewalDate: '2028-01-01',
  advanceReminderRules: '1&09:00;', overdueReminderRules: '2&09:00;',
  webhookEnabled: true, notes: 'Notes', websiteUrl: 'https://example.com', logoUrl: '/logo.png', logoSource: 'upload',
  status: 'active', notifyDaysBefore: 3, tags: [{ id: 'tag-1', name: 'Tools', color: '#fff', icon: '', sortOrder: 0 }],
  createdAt: '2026-01-01', updatedAt: '2026-01-01'
}
const wrappers: VueWrapper[] = []
function mountForm(props: Record<string, unknown> = {}) {
  const wrapper = shallowMount(SubscriptionFormModal, {
    props: { show: true, tags: original.tags!, ...props },
    global: { renderStubDefaultSlot: true, stubs: { Button: false, BaseWave: false } }
  })
  wrappers.push(wrapper)
  return wrapper
}
function field(wrapper: VueWrapper, label: string) {
  const result = wrapper.findAllComponents(NFormItem).find((item) => item.props('label') === label)
  if (!result) throw new Error(`Missing form field: ${label}`)
  return result
}
function button(wrapper: VueWrapper, text: string) {
  const result = wrapper.findAllComponents(NButton).find((item) => item.text() === text)
  if (!result) throw new Error(`Missing button: ${text}`)
  return result
}
async function save(wrapper: VueWrapper) {
  await button(wrapper, t('common.actions.save')).trigger('click')
  return wrapper.emitted('submit')?.at(-1)
}
beforeEach(() => {
  settings.value = undefined
  vi.clearAllMocks()
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

describe('SubscriptionFormModal create, copy and lifetime behavior', () => {
  it('uses loaded or delayed base currency for untouched new forms', async () => {
    settings.value = { baseCurrency: 'EUR', timezone: 'UTC' }
    const loaded = mountForm()
    expect(field(loaded, t('common.labels.currency')).getComponent(NSelect).props('value')).toBe('EUR')

    settings.value = undefined
    const delayed = mountForm()
    expect(field(delayed, t('common.labels.currency')).getComponent(NSelect).props('value')).toBe('CNY')
    settings.value = { baseCurrency: 'GBP', timezone: 'UTC' }
    await nextTick()
    expect(field(delayed, t('common.labels.currency')).getComponent(NSelect).props('value')).toBe('GBP')
  })

  it('does not override an explicit currency selection when settings arrive and resets to the latest default', async () => {
    const wrapper = mountForm()
    const currency = field(wrapper, t('common.labels.currency')).getComponent(NSelect)
    // Even explicitly selecting the fallback currency counts as a user choice.
    currency.vm.$emit('update:value', 'CNY')
    settings.value = { baseCurrency: 'EUR', timezone: 'UTC' }
    await nextTick()
    expect(currency.props('value')).toBe('CNY')
    await button(wrapper, t('common.actions.reset')).trigger('click')
    expect(currency.props('value')).toBe('EUR')
  })

  it('does not override a currency supplied by AI recognition when settings arrive', async () => {
    const wrapper = mountForm()
    wrapper.findComponent({ name: 'SubscriptionAiModal' }).vm.$emit('apply', { currency: 'JPY' })
    settings.value = { baseCurrency: 'EUR', timezone: 'UTC' }
    await nextTick()
    expect(field(wrapper, t('common.labels.currency')).getComponent(NSelect).props('value')).toBe('JPY')
  })

  it('prefills a copy as a new subscription without identity or history, preserving its currency and dates', async () => {
    const wrapper = mountForm({ initialValues: buildSubscriptionCopyDraft(original) })
    settings.value = { baseCurrency: 'EUR', timezone: 'America/New_York' }
    await nextTick()
    expect(wrapper.getComponent(NModal).props('title')).toBe(t('subscriptions.form.titleCreate'))
    expect(field(wrapper, t('common.labels.currency')).getComponent(NSelect).props('value')).toBe('USD')
    const submission = await save(wrapper)
    expect(submission?.[1]).toBeUndefined()
    expect(submission?.[0]).toMatchObject({
      name: original.name, currency: 'USD', billingType: 'recurring', amount: 49, tagIds: ['tag-1'],
      startDate: '2026-01-01', nextRenewalDate: '2028-01-01', notes: 'Notes', logoUrl: '/logo.png'
    })
    expect(submission?.[0]).not.toHaveProperty('id')
    expect(submission?.[0]).not.toHaveProperty('paymentRecords')
    expect(original.currency).toBe('USD')
  })

  it('preserves edit currency and submits the editing id while legacy records default to recurring', async () => {
    const wrapper = mountForm({ model: original })
    settings.value = { baseCurrency: 'GBP', timezone: 'UTC' }
    await nextTick()
    const submission = await save(wrapper)
    expect(submission?.[1]).toBe('original')
    expect(submission?.[0]).toMatchObject({ currency: 'USD', billingType: 'recurring', autoRenew: true })
  })

  it('hides all renewal controls for lifetime and submits safe placeholders even with no renewal date', async () => {
    const wrapper = mountForm({ model: original })
    wrapper.findAllComponents(NDatePicker)[1].vm.$emit('update:value', null)
    field(wrapper, t('subscriptions.labels.billingType')).getComponent(NSelect).vm.$emit('update:value', 'lifetime')
    await nextTick()
    const labels = wrapper.findAllComponents(NFormItem).map((item) => item.props('label'))
    expect(labels).not.toContain(t('common.labels.frequency'))
    expect(labels).not.toContain(t('common.labels.unit'))
    expect(wrapper.findAllComponents(NDatePicker)).toHaveLength(1)
    expect(wrapper.findAllComponents(NSwitch)).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'ReminderRulesPreview' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain(t('subscriptions.form.actions.previewReminderRules'))
    expect(wrapper.findAllComponents(NInput).some((item) => item.props('placeholder') === t('subscriptions.form.advanceReminderRulesPlaceholder'))).toBe(false)
    expect(wrapper.findAllComponents(NInput).some((item) => item.props('placeholder') === t('subscriptions.form.overdueReminderRulesPlaceholder'))).toBe(false)

    const submission = await save(wrapper)
    expect(submission?.[0]).toMatchObject({
      billingType: 'lifetime', autoRenew: false, webhookEnabled: false,
      startDate: '2026-01-01', nextRenewalDate: '2026-01-01', billingIntervalCount: 1, billingIntervalUnit: 'month',
      advanceReminderRules: '', overdueReminderRules: ''
    })
    field(wrapper, t('subscriptions.labels.billingType')).getComponent(NSelect).vm.$emit('update:value', 'recurring')
    await nextTick()
    expect(wrapper.findAllComponents(NDatePicker)).toHaveLength(2)
    const submittedCount = wrapper.emitted('submit')?.length
    await save(wrapper)
    expect(wrapper.emitted('submit')).toHaveLength(submittedCount!)
    expect(messages.warning).toHaveBeenCalled()
  })

  it('creates a lifetime copy, retaining billing type but no editing id', async () => {
    const wrapper = mountForm({ initialValues: buildSubscriptionCopyDraft({ ...original, billingType: 'lifetime' }) })
    const submission = await save(wrapper)
    expect(submission?.[1]).toBeUndefined()
    expect(submission?.[0]).toMatchObject({ billingType: 'lifetime', autoRenew: false, webhookEnabled: false })
  })

  it('validates required purchase fields even when lifetime renewal fields are hidden', async () => {
    const wrapper = mountForm()
    field(wrapper, t('subscriptions.labels.billingType')).getComponent(NSelect).vm.$emit('update:value', 'lifetime')
    field(wrapper, t('common.labels.amount')).getComponent(NInputNumber).vm.$emit('update:value', 10)
    await save(wrapper)
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(messages.warning).toHaveBeenCalled()
  })
})
