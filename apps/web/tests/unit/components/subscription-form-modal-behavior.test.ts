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
  getSubscriptionImages: vi.fn().mockResolvedValue([]),
  getSubscriptionImageContent: vi.fn().mockResolvedValue(new Blob()),
  deleteSubscriptionImage: vi.fn().mockResolvedValue({}),
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
function riskDialog(wrapper: VueWrapper) {
  return wrapper.findAllComponents(NModal).find(item => item.props('preset') === 'dialog')!
}
async function acceptLogoRisk(wrapper: VueWrapper) {
  riskDialog(wrapper).vm.$emit('positive-click')
  await nextTick()
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

describe('SubscriptionFormModal logo URL import', () => {
  const svg = '<svg onload="alert(1)"><script>alert(1)</script></svg>'
  const svgResult = { requiresSvgConfirmation: true as const, svgBase64: btoa(svg), logoSource: 'url' }

  async function openPanel(wrapper: VueWrapper, url: string) {
    const openButton = wrapper.findAllComponents(NButton).find((item) => item.props('circle'))!
    await openButton.trigger('click')
    await flushPromises()
    const input = wrapper.findAllComponents(NInput).find((item) => item.props('placeholder') === t('subscriptions.form.logo.urlPlaceholder'))!
    input.vm.$emit('update:value', url)
    await nextTick()
    return button(wrapper, t('subscriptions.form.logo.importUrl'))
  }

  it('downloads a URL once, shows loading and applies only the returned local logo', async () => {
    let resolveImport!: (value: { logoUrl: string; logoSource: string }) => void
    vi.mocked(api.importSubscriptionLogo).mockImplementationOnce(() => new Promise((resolve) => { resolveImport = resolve }))
    const wrapper = mountForm({ model: original })
    const importButton = await openPanel(wrapper, '  https://example.com/remote.png  ')
    await importButton.trigger('click')
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(importButton.props('loading')).toBe(true)
    await importButton.trigger('click')
    expect(api.importSubscriptionLogo).toHaveBeenCalledTimes(1)
    expect(api.importSubscriptionLogo).toHaveBeenCalledWith({ logoUrl: 'https://example.com/remote.png', source: 'url' })
    resolveImport({ logoUrl: '/uploads/logos/downloaded.png', logoSource: 'url' })
    await flushPromises()
    expect(wrapper.find('.logo-panel').exists()).toBe(false)
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
    const submission = await save(wrapper)
    expect(submission?.[0]).toMatchObject({ logoUrl: '/uploads/logos/downloaded.png', logoSource: 'url' })
    expect(api.getSubscriptionLogoLibrary).toHaveBeenCalledTimes(2)
    expect(messages.success).toHaveBeenCalledWith(t('subscriptions.messages.logoSavedAndApplied'))
  })

  it('reports import failure, clears loading and leaves the prior logo intact for retry', async () => {
    vi.mocked(api.importSubscriptionLogo).mockRejectedValueOnce(new Error('Invalid image URL'))
    const wrapper = mountForm({ model: original })
    const importButton = await openPanel(wrapper, 'https://example.com/broken.png')
    await importButton.trigger('click')
    await flushPromises()
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(importButton.props('loading')).toBe(false)
    expect(wrapper.find('.logo-panel').exists()).toBe(true)
    expect(messages.error).toHaveBeenCalledWith('Invalid image URL')
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: '/logo.png', logoSource: 'upload' })
  })

  it('asks only for detected SVG, then uploads the exact downloaded bytes without another URL request', async () => {
    vi.mocked(api.importSubscriptionLogo).mockResolvedValueOnce(svgResult)
    vi.mocked(api.uploadSubscriptionLogo).mockResolvedValueOnce({ logoUrl: '/static/logos/accepted.svg', logoSource: 'upload' })
    const wrapper = mountForm({ model: original })
    await (await openPanel(wrapper, 'https://example.com/looks-like-png.png')).trigger('click')
    await flushPromises()
    expect(riskDialog(wrapper).props('show')).toBe(true)
    expect(riskDialog(wrapper).props('content')).toBe(t('subscriptions.form.logo.svgRiskDescription'))
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: original.logoUrl })
    await acceptLogoRisk(wrapper)
    await flushPromises()
    expect(api.uploadSubscriptionLogo).toHaveBeenCalledExactlyOnceWith({ filename: 'logo.svg', contentType: 'image/svg+xml', base64: btoa(svg) })
    expect(api.importSubscriptionLogo).toHaveBeenCalledTimes(1)
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: '/static/logos/accepted.svg', logoSource: 'url' })
  })

  it('does not warn for a raster image even when the URL ends in svg', async () => {
    vi.mocked(api.importSubscriptionLogo).mockResolvedValueOnce({ logoUrl: '/static/logos/image.png', logoSource: 'url' })
    const wrapper = mountForm({ model: original })
    await (await openPanel(wrapper, 'https://example.com/logo.svg')).trigger('click')
    await flushPromises()
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: '/static/logos/image.png' })
  })

  it.each(['negative-click', 'update:show'])('discards detected SVG on cancellation without saving or changing the current logo (%s)', async (event) => {
    vi.mocked(api.importSubscriptionLogo).mockResolvedValueOnce(svgResult)
    const wrapper = mountForm({ model: original })
    const importButton = await openPanel(wrapper, 'https://example.com/logo.svg')
    await importButton.trigger('click')
    await flushPromises()
    expect(riskDialog(wrapper).props('show')).toBe(true)
    riskDialog(wrapper).vm.$emit(event, false)
    await nextTick()
    await acceptLogoRisk(wrapper)
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(api.importSubscriptionLogo).toHaveBeenCalledTimes(1)
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: original.logoUrl })
  })

  it('clears pending consent when the subscription form closes', async () => {
    vi.mocked(api.importSubscriptionLogo).mockResolvedValueOnce(svgResult)
    const wrapper = mountForm({ model: original })
    await (await openPanel(wrapper, 'https://example.com/logo.svg')).trigger('click')
    await flushPromises()
    await wrapper.setProps({ show: false })
    await acceptLogoRisk(wrapper)
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
  })

  it('ignores a late SVG detection response after closing and reopening the form', async () => {
    let resolveImport!: (value: typeof svgResult) => void
    vi.mocked(api.importSubscriptionLogo).mockImplementationOnce(() => new Promise(resolve => { resolveImport = resolve }))
    const wrapper = mountForm({ model: original })
    await (await openPanel(wrapper, 'https://example.com/logo.svg')).trigger('click')
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    resolveImport(svgResult)
    await flushPromises()
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: original.logoUrl })
  })
})

describe('SubscriptionFormModal SVG uploads', () => {
  async function chooseFile(wrapper: VueWrapper, file: File) {
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(riskDialog(wrapper).props('show') || vi.mocked(api.uploadSubscriptionLogo).mock.calls.length > 0).toBe(true))
  }

  it.each([
    ['GIF89a', 'image/gif'], ['BM', 'image/bmp'],
    ['\0\0\x01\0\x01\0', 'image/vnd.microsoft.icon'],
    ['\0\0\0\x14ftypavif\0\0\0\0mif1', 'image/avif']
  ])('uploads detected %s as %s without an SVG warning despite its filename and MIME', async (bytes, contentType) => {
    const wrapper = mountForm({ model: original })
    vi.mocked(api.uploadSubscriptionLogo).mockResolvedValueOnce({ logoUrl: '/static/logos/new-logo', logoSource: 'upload' })
    await chooseFile(wrapper, new File([bytes], 'wrong.svg', { type: 'image/svg+xml' }))
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(api.uploadSubscriptionLogo).toHaveBeenCalledExactlyOnceWith({ filename: 'wrong.svg', contentType, base64: btoa(bytes) })
    await flushPromises()
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: '/static/logos/new-logo' })
  })

  it.each([
    ['logo.svg', 'image/svg+xml'], ['logo.svg', ''], ['logo.png', 'image/png']
  ])('detects SVG bytes and uploads only after consent (%s, %s)', async (filename, type) => {
    const wrapper = mountForm({ model: original })
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    vi.mocked(api.uploadSubscriptionLogo).mockResolvedValueOnce({ logoUrl: '/static/logos/accepted.svg', logoSource: 'upload' })
    await chooseFile(wrapper, new File([svg], filename, { type }))
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
    expect(riskDialog(wrapper).props('show')).toBe(true)
    await acceptLogoRisk(wrapper)
    await vi.waitFor(() => expect(api.uploadSubscriptionLogo).toHaveBeenCalledWith({
      filename, contentType: 'image/svg+xml', base64: btoa(svg)
    }))
    await flushPromises()
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: '/static/logos/accepted.svg' })
  })

  it('allows cancelling an SVG upload without uploading or altering the previous logo', async () => {
    const wrapper = mountForm({ model: original })
    await chooseFile(wrapper, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))
    riskDialog(wrapper).vm.$emit('negative-click')
    await nextTick()
    await acceptLogoRisk(wrapper)
    expect(api.uploadSubscriptionLogo).not.toHaveBeenCalled()
    expect((await save(wrapper))?.[0]).toMatchObject({ logoUrl: original.logoUrl })
  })

  it.each([
    ['logo.png', 'image/png'], ['logo.svg', 'image/svg+xml']
  ])('keeps actual raster uploads free of SVG confirmation, regardless of name or MIME (%s)', async (filename, type) => {
    const wrapper = mountForm({ model: original })
    vi.mocked(api.uploadSubscriptionLogo).mockResolvedValueOnce({ logoUrl: '/static/logos/image.png', logoSource: 'upload' })
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await chooseFile(wrapper, new File([bytes], filename, { type }))
    expect(riskDialog(wrapper).props('show')).toBe(false)
    expect(api.uploadSubscriptionLogo).toHaveBeenCalledWith({ filename, contentType: 'image/png', base64: btoa(String.fromCharCode(...bytes)) })
  })
})
