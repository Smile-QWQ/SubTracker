import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { NButton, NCard, NDrawer, NFormItem, NImage, NImageGroup, NInput, NModal, NRadioButton, NRadioGroup, NTabPane, NTabs } from 'naive-ui'
import SubscriptionImages from '@/components/SubscriptionImages.vue'
import SubscriptionFormModal from '@/components/SubscriptionFormModal.vue'
import SubscriptionDetailDrawer from '@/components/SubscriptionDetailDrawer.vue'
import { useSubscriptionImages, SUBSCRIPTION_IMAGE_MAX_BYTES, type SubscriptionImagesController } from '@/composables/subscription-images'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { clearAuthSession, saveAuthSession } from '@/utils/auth-storage'
import type { Subscription, SubscriptionDetail, SubscriptionImage, SubscriptionImageImportResult } from '@/types/api'

vi.mock('@/composables/api', () => ({ api: {
  getSubscriptionImages: vi.fn(), getSubscriptionImageContent: vi.fn(), uploadSubscriptionImage: vi.fn(),
  importSubscriptionImage: vi.fn(), deleteSubscriptionImage: vi.fn()
} }))
vi.mock('@/composables/settings-query', () => ({ useSettingsQuery: () => ({ data: ref({ timezone: 'UTC' }) }) }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn() }) }))

const original: Subscription = {
  id: 'original', name: 'Service', description: '', notes: 'Keep these notes', amount: 10, currency: 'USD',
  billingType: 'lifetime', billingIntervalCount: 1, billingIntervalUnit: 'month', autoRenew: false,
  webhookEnabled: false, notifyDaysBefore: 0, status: 'active', startDate: '2026-01-01', nextRenewalDate: '2026-01-01',
  createdAt: '2026-01-01', updatedAt: '2026-01-01'
}
const detail: SubscriptionDetail = { ...original, currentCycleStartDate: '', currentCycleEndDate: '', remainingDays: 0, remainingRatio: 0, remainingValue: 0, remainingValueCurrency: 'USD' }
const metadata = (id: string): SubscriptionImage => ({ id, fileName: `${id}.png`, size: 8, contentType: 'image/png', createdAt: '2026-01-01' })
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const file = (name = 'image.png', bytes: BlobPart = png, type = 'image/png') => new File([bytes], name, { type })
const wrappers: VueWrapper[] = []

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function harness(id?: string, readonly = false) {
  const source = reactive({ active: true, id, saving: false })
  let controller!: SubscriptionImagesController
  const wrapper = shallowMount(defineComponent({
    setup() {
      controller = useSubscriptionImages({ active: () => source.active, subscriptionId: () => source.id, disabled: () => source.saving })
      return () => h(SubscriptionImages, { controller, readonly })
    }
  }), { global: { stubs: { SubscriptionImages: false, Button: false, BaseWave: false }, renderStubDefaultSlot: true } })
  wrappers.push(wrapper)
  return { wrapper, controller, source }
}
function mountForm(props: Record<string, unknown> = {}, realTabs = false) {
  const wrapper = shallowMount(SubscriptionFormModal, {
    props: { show: true, tags: [], model: original, ...props },
    attachTo: realTabs ? document.body : undefined,
    global: { renderStubDefaultSlot: true, stubs: { SubscriptionImages: false, Button: false, BaseWave: false, ...(realTabs ? { Tabs: false, TabPane: false, Tab: false } : {}) } }
  })
  wrappers.push(wrapper)
  return wrapper
}
function mountDetail(props: Record<string, unknown> = {}) {
  const wrapper = shallowMount(SubscriptionDetailDrawer, {
    props: { show: true, detail, ...props }, attachTo: document.body,
    global: { renderStubDefaultSlot: true, stubs: { SubscriptionImages: false, Card: false, RadioGroup: false, RadioButton: false, Button: false, BaseWave: false } }
  })
  wrappers.push(wrapper)
  return wrapper
}
async function switchDetailNotes(wrapper: VueWrapper, value: 'text' | 'images') {
  await wrapper.getComponent(NRadioGroup).findAllComponents(NRadioButton).find(item => item.props('value') === value)!.trigger('click')
}
function controllerOf(wrapper: VueWrapper) {
  return wrapper.getComponent(SubscriptionImages).props('controller') as SubscriptionImagesController
}
function button(wrapper: VueWrapper, text: string) {
  return wrapper.findAllComponents(NButton).find(item => item.text() === text)!
}
async function choose(wrapper: VueWrapper, files: File[]) {
  const input = wrapper.get('input[type="file"][multiple]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.mocked(api.getSubscriptionImages).mockResolvedValue([])
  vi.mocked(api.getSubscriptionImageContent).mockResolvedValue(new Blob([png], { type: 'image/png' }))
  vi.mocked(api.deleteSubscriptionImage).mockResolvedValue({})
  let count = 0
  vi.mocked(api.uploadSubscriptionImage).mockImplementation(async payload => ({ ...metadata(`new-${++count}`), fileName: payload.fileName, contentType: payload.contentType }))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:private-${++count}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

describe('SubscriptionImages local uploads and limits', () => {
  it('uploads multi-selected local files serially, deriving MIME from bytes and showing private previews', async () => {
    const first = deferred<SubscriptionImage>()
    vi.mocked(api.uploadSubscriptionImage).mockReturnValueOnce(first.promise)
    const { wrapper, controller } = harness()
    await choose(wrapper, [file('<b>first.svg</b>', png, 'image/svg+xml'), file('second.gif', 'GIF89a', '')])
    await vi.waitFor(() => expect(api.uploadSubscriptionImage).toHaveBeenCalledTimes(1))
    expect(controller.ready.value).toBe(false)
    expect(api.uploadSubscriptionImage).toHaveBeenNthCalledWith(1, { fileName: '<b>first.svg</b>', contentType: 'image/png', dataBase64: 'iVBORw0KGgo=' })
    first.resolve({ ...metadata('one'), fileName: '<b>first.svg</b>' })
    await vi.waitFor(() => expect(controller.ready.value).toBe(true))
    expect(api.uploadSubscriptionImage).toHaveBeenCalledTimes(2)
    expect(api.uploadSubscriptionImage).toHaveBeenLastCalledWith(expect.objectContaining({ contentType: 'image/gif' }))
    expect(wrapper.findAllComponents(NImage)).toHaveLength(2)
    expect(wrapper.getComponent(NImageGroup).exists()).toBe(true)
    expect(wrapper.findAllComponents(NImage).every(image => image.props('src').startsWith('blob:private-'))).toBe(true)
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.text()).toContain('<b>first.svg</b>')
    expect(wrapper.findComponent(NModal).exists()).toBe(false)
    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith('one')
  })

  it.each([true, false])('prompts actual local SVG bytes only and respects confirmation=%s', async accepted => {
    const { wrapper, controller } = harness()
    const svg = '<svg onload="alert(1)" />'
    const task = controller.uploadFiles([file('fake.png', svg, 'image/png')])
    await vi.waitFor(() => expect(wrapper.findComponent(NModal).exists()).toBe(true))
    expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
    wrapper.getComponent(NModal).vm.$emit(accepted ? 'positive-click' : 'negative-click')
    await task
    if (accepted) expect(api.uploadSubscriptionImage).toHaveBeenCalledWith({ fileName: 'fake.png', contentType: 'image/svg+xml', dataBase64: btoa(svg), svgConfirmed: true })
    else expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
  })

  it.each([
    ['jpeg', new Uint8Array([255, 216, 255]), 'image/jpeg'],
    ['webp', 'RIFF0000WEBP', 'image/webp'],
    ['bmp', 'BM', 'image/bmp'],
    ['ico', new Uint8Array([0, 0, 1, 0, 1, 0]), 'image/vnd.microsoft.icon'],
    ['avif', new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0, 109, 105, 102, 49]), 'image/avif']
  ])('accepts actual %s bytes despite an incorrect filename/MIME', async (_name, bytes, contentType) => {
    const { controller } = harness()
    await controller.uploadFiles([file('misleading.svg', bytes, 'image/svg+xml')])
    expect(api.uploadSubscriptionImage).toHaveBeenCalledWith(expect.objectContaining({ contentType }))
    expect(controller.state.confirmingSvg).toBe(false)
  })

  it('rejects zero, unknown and >20MiB files but accepts exactly 20MiB, continuing the batch', async () => {
    const bytes = new Uint8Array(SUBSCRIPTION_IMAGE_MAX_BYTES)
    bytes.set(png)
    const { controller } = harness()
    await controller.uploadFiles([file('zero', ''), file('unknown', 'not an image'), file('large', new Uint8Array(SUBSCRIPTION_IMAGE_MAX_BYTES + 1)), file('boundary', bytes)])
    expect(controller.state.errors).toHaveLength(3)
    expect(controller.state.errors.join(' ')).toContain('20 MiB')
    expect(api.uploadSubscriptionImage).toHaveBeenCalledTimes(1)
    expect(api.uploadSubscriptionImage).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'boundary', contentType: 'image/png' }))
  })

  it('respects the 20-image limit during multi-select and URL import', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue(Array.from({ length: 19 }, (_, index) => metadata(`saved-${index}`)))
    const { wrapper, controller } = harness('original')
    await flushPromises()
    await controller.uploadFiles([file('twentieth'), file('too-many')])
    expect(controller.state.images).toHaveLength(20)
    expect(api.uploadSubscriptionImage).toHaveBeenCalledTimes(1)
    expect(controller.state.errors).toContain(t('api.errors.subscriptionImages.limitExceeded'))
    await controller.importUrl('https://example.com/image')
    expect(api.importSubscriptionImage).not.toHaveBeenCalled()
    expect(button(wrapper, t('subscriptions.images.upload')).props('disabled')).toBe(true)
  })
})

describe('SubscriptionImages URL imports', () => {
  it('directly accepts a non-SVG URL result without an extra upload or consent', async () => {
    vi.mocked(api.importSubscriptionImage).mockResolvedValue({ requiresConfirmation: false, image: metadata('remote') })
    const { wrapper, controller } = harness()
    wrapper.getComponent(NInput).vm.$emit('update:value', ' https://example.com/misleading.svg ')
    await nextTick()
    await button(wrapper, t('subscriptions.images.import')).trigger('click')
    await flushPromises()
    expect(api.importSubscriptionImage).toHaveBeenCalledWith({ url: 'https://example.com/misleading.svg' })
    expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
    expect(wrapper.findComponent(NModal).exists()).toBe(false)
    expect(controller.selection()?.imageIds).toEqual(['remote'])
  })

  it.each([true, false])('uses the same downloaded SVG bytes only after confirmation=%s', async accepted => {
    const dataBase64 = btoa('<svg><script>alert(1)</script></svg>')
    vi.mocked(api.importSubscriptionImage).mockResolvedValue({ requiresConfirmation: true, fileName: 'remote.svg', contentType: 'image/svg+xml', dataBase64 })
    const { controller } = harness()
    const task = controller.importUrl('https://example.com/misleading.png')
    await flushPromises()
    expect(controller.ready.value).toBe(false)
    expect(controller.state.confirmingSvg).toBe(true)
    expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
    controller.confirmSvg(accepted)
    await task
    if (accepted) expect(api.uploadSubscriptionImage).toHaveBeenCalledWith({ fileName: 'remote.svg', contentType: 'image/svg+xml', dataBase64, svgConfirmed: true })
    else expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
    expect(api.importSubscriptionImage).toHaveBeenCalledTimes(1)
  })

  it('cleans a late persisted URL result after cancel without leaking a preview', async () => {
    const late = deferred<SubscriptionImageImportResult>()
    vi.mocked(api.importSubscriptionImage).mockReturnValueOnce(late.promise)
    const { controller } = harness()
    const task = controller.importUrl('https://example.com/image')
    controller.cancel()
    late.resolve({ requiresConfirmation: false, image: metadata('late') })
    await task
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith('late')
    expect(api.getSubscriptionImageContent).not.toHaveBeenCalled()
    expect(controller.state.images).toEqual([])
  })
})

describe('SubscriptionFormModal image save lifecycle', () => {
  it('stages existing removals until save, preserves notes, and cancel deletes only new pending images', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    const wrapper = mountForm()
    await flushPromises()
    const controller = controllerOf(wrapper)
    await controller.remove('saved')
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
    await controller.uploadFiles([file()])
    const pendingId = controller.state.images[0].id
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')?.[0][0]).toMatchObject({ notes: 'Keep these notes', imageIds: [pendingId] })
    await button(wrapper, t('common.actions.cancel')).trigger('click')
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith(pendingId)
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalledWith('saved')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('removes pending uploads immediately, revokes their previews and excludes them from save', async () => {
    const { controller } = harness()
    await controller.uploadFiles([file()])
    const id = controller.state.images[0].id
    await controller.remove(id)
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith(id)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(controller.selection()?.imageIds).toEqual([])
    controller.cancel()
    expect(api.deleteSubscriptionImage).toHaveBeenCalledTimes(1)
  })

  it('cancels an outstanding SVG confirmation with the form without persisting anything', async () => {
    const wrapper = mountForm({ model: null })
    const controller = controllerOf(wrapper)
    const task = controller.uploadFiles([file('test.png', '<svg/>')])
    await vi.waitFor(() => expect(controller.state.confirmingSvg).toBe(true))
    await button(wrapper, t('common.actions.cancel')).trigger('click')
    await task
    expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
    expect(controller.state.confirmingSvg).toBe(false)
  })

  it('acknowledges successful binding before closing so committed uploads are not deleted', async () => {
    const wrapper = mountForm({ model: null, initialValues: original })
    const controller = controllerOf(wrapper)
    await controller.uploadFiles([file()])
    await button(wrapper, t('common.actions.save')).trigger('click')
    const onSaved = wrapper.emitted('submit')![0][2] as () => void
    onSaved()
    await wrapper.setProps({ show: false, initialValues: null })
    wrapper.unmount()
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('blocks save during initial list loading/failure and recovers only after retry', async () => {
    const list = deferred<SubscriptionImage[]>()
    vi.mocked(api.getSubscriptionImages).mockReturnValueOnce(list.promise)
    const wrapper = mountForm()
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(true)
    list.reject(new Error('Offline'))
    await flushPromises()
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain(t('subscriptions.images.loadFailed'))
    await button(wrapper, t('subscriptions.images.retry')).trigger('click')
    await flushPromises()
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')?.[0][0]).toMatchObject({ imageIds: [] })
  })

  it('gates save during private reads and uploads and prevents edits while the parent is saving', async () => {
    const blob = deferred<Blob>()
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    vi.mocked(api.getSubscriptionImageContent).mockReturnValueOnce(blob.promise)
    const wrapper = mountForm()
    await flushPromises()
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(true)
    blob.resolve(new Blob([png]))
    await flushPromises()
    const controller = controllerOf(wrapper)
    const upload = deferred<SubscriptionImage>()
    vi.mocked(api.uploadSubscriptionImage).mockReturnValueOnce(upload.promise)
    const task = controller.uploadFiles([file()])
    await vi.waitFor(() => expect(api.uploadSubscriptionImage).toHaveBeenCalled())
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(true)
    upload.resolve(metadata('pending'))
    await task
    await wrapper.setProps({ saving: true })
    await controller.remove('saved')
    await controller.uploadFiles([file()])
    expect(controller.state.images).toHaveLength(2)
    expect(api.uploadSubscriptionImage).toHaveBeenCalledTimes(1)
  })

  it('starts copies and creates empty even if initialValues accidentally includes an original id', async () => {
    const wrapper = mountForm({ model: null, initialValues: original })
    expect(api.getSubscriptionImages).not.toHaveBeenCalled()
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')?.[0][0]).toMatchObject({ imageIds: [], notes: original.notes })
    expect(wrapper.emitted('submit')?.[0][1]).toBeUndefined()
    await wrapper.setProps({ initialValues: null })
    expect(controllerOf(wrapper).selection()?.imageIds).toEqual([])
  })

  it('reset discards pending edits and reloads original images without deleting saved files', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    const wrapper = mountForm()
    await flushPromises()
    const controller = controllerOf(wrapper)
    await controller.remove('saved')
    await controller.uploadFiles([file()])
    const pendingId = controller.state.images[0].id
    await button(wrapper, t('common.actions.reset')).trigger('click')
    await flushPromises()
    expect(controller.selection()?.imageIds).toEqual(['saved'])
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith(pendingId)
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalledWith('saved')
  })
})

describe('subscription notes tabs', () => {
  function tabs(wrapper: VueWrapper) {
    return wrapper.findAllComponents(NTabs).find(item => item.classes().includes('subscription-notes-tabs'))!
  }
  function textInput(wrapper: VueWrapper) {
    return wrapper.findAllComponents(NInput).find(item => item.props('placeholder') === t('subscriptions.form.notesPlaceholder'))!
  }
  function textPane(wrapper: VueWrapper) {
    return wrapper.findAllComponents(NTabPane).find(item => item.props('name') === 'text')!
  }
  async function switchTab(wrapper: VueWrapper, index: number) {
    await tabs(wrapper).findAll('.n-tabs-tab')[index].trigger('click')
  }

  it('shows one pane at a time and preserves notes, URL draft, image selection and previews across switches', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    const wrapper = mountForm({}, true)
    await flushPromises()
    const notesItem = wrapper.findAllComponents(NFormItem).find(item => item.find('.subscription-notes-tabs').exists())!
    expect(notesItem.props('showLabel')).toBe(false)
    expect(notesItem.props('label')).toBeUndefined()
    expect(tabs(wrapper).props('value')).toBe('text')
    expect(textPane(wrapper).isVisible()).toBe(true)
    expect(wrapper.getComponent(SubscriptionImages).isVisible()).toBe(false)
    textInput(wrapper).vm.$emit('update:value', 'Edited notes')
    await switchTab(wrapper, 1)
    const gallery = wrapper.getComponent(SubscriptionImages)
    const controller = controllerOf(wrapper)
    await controller.uploadFiles([file()])
    const pendingId = controller.state.images[1].id
    gallery.getComponent(NInput).vm.$emit('update:value', 'https://example.com/draft.png')
    await nextTick()
    expect(tabs(wrapper).text()).toContain(t('subscriptions.notesTabs.images', { count: 2 }))
    expect(gallery.isVisible()).toBe(true)
    expect(textPane(wrapper).isVisible()).toBe(false)
    await switchTab(wrapper, 0)
    await switchTab(wrapper, 1)
    expect(controllerOf(wrapper)).toBe(controller)
    expect(gallery.getComponent(NInput).props('value')).toBe('https://example.com/draft.png')
    expect(textInput(wrapper).props('value')).toBe('Edited notes')
    expect(api.getSubscriptionImages).toHaveBeenCalledTimes(1)
    expect(api.getSubscriptionImageContent).toHaveBeenCalledTimes(2)
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await switchTab(wrapper, 0)
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')?.[0][0]).toMatchObject({ notes: 'Edited notes', imageIds: ['saved', pendingId] })
    await button(wrapper, t('common.actions.cancel')).trigger('click')
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith(pendingId)
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalledWith('saved')
  })

  it('finishes an in-flight upload while the text tab is active without losing its pending image', async () => {
    const wrapper = mountForm({}, true)
    await flushPromises()
    await switchTab(wrapper, 1)
    const upload = deferred<SubscriptionImage>()
    vi.mocked(api.uploadSubscriptionImage).mockReturnValueOnce(upload.promise)
    const task = controllerOf(wrapper).uploadFiles([file()])
    await vi.waitFor(() => expect(api.uploadSubscriptionImage).toHaveBeenCalledTimes(1))
    await switchTab(wrapper, 0)
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(true)
    upload.resolve(metadata('pending'))
    await task
    await nextTick()
    expect(tabs(wrapper).props('value')).toBe('text')
    expect(tabs(wrapper).text()).toContain(t('subscriptions.notesTabs.images', { count: 1 }))
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(false)
    expect(controllerOf(wrapper).selection()?.imageIds).toEqual(['pending'])
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
  })

  it('resets tab selection for form reset, reopen and source changes', async () => {
    const wrapper = mountForm({}, true)
    await flushPromises()
    await switchTab(wrapper, 1)
    await button(wrapper, t('common.actions.reset')).trigger('click')
    expect(tabs(wrapper).props('value')).toBe('text')
    await switchTab(wrapper, 1)
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    expect(tabs(wrapper).props('value')).toBe('text')
    await switchTab(wrapper, 1)
    await wrapper.setProps({ model: { ...original, id: 'second' } })
    expect(tabs(wrapper).props('value')).toBe('text')
  })

  it('reveals image loading failures so a blocked save has a visible retry action', async () => {
    vi.mocked(api.getSubscriptionImages).mockRejectedValueOnce(new Error('Offline'))
    const wrapper = mountForm({}, true)
    await flushPromises()
    expect(tabs(wrapper).props('value')).toBe('images')
    expect(wrapper.getComponent(SubscriptionImages).isVisible()).toBe(true)
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(true)
    await button(wrapper, t('subscriptions.images.retry')).trigger('click')
    await flushPromises()
    expect(button(wrapper, t('common.actions.save')).props('disabled')).toBe(false)
  })

  it.each(['form', 'detail'])('keeps the %s container open while an image preview handles Escape', async (kind) => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    const wrapper = kind === 'form' ? mountForm() : shallowMount(SubscriptionDetailDrawer, {
      props: { show: true, detail },
      global: { renderStubDefaultSlot: true, stubs: { SubscriptionImages: false, Button: false, BaseWave: false } }
    })
    if (kind === 'detail') wrappers.push(wrapper)
    await flushPromises()
    const container = kind === 'form' ? wrapper.getComponent(NModal) : wrapper.getComponent(NDrawer)
    expect(container.props('closeOnEsc')).toBe(true)
    wrapper.getComponent(NImageGroup).vm.$emit('update:show', true)
    await nextTick()
    expect(container.props('closeOnEsc')).toBe(false)
    wrapper.getComponent(NImageGroup).vm.$emit('update:show', false)
    await nextTick()
    expect(container.props('closeOnEsc')).toBe(true)
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('lets SVG confirmation handle Escape without closing the form', async () => {
    const wrapper = mountForm()
    await flushPromises()
    const formModal = wrapper.findAllComponents(NModal).find(modal => modal.props('preset') === 'card')!
    const controller = controllerOf(wrapper)
    const task = controller.uploadFiles([file('record.svg', '<svg/>')])
    await vi.waitFor(() => expect(controller.state.confirmingSvg).toBe(true))
    expect(formModal.props('closeOnEsc')).toBe(false)
    wrapper.getComponent(SubscriptionImages).getComponent(NModal).vm.$emit('update:show', false)
    await task
    await nextTick()
    expect(formModal.props('closeOnEsc')).toBe(true)
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(api.uploadSubscriptionImage).not.toHaveBeenCalled()
  })

  it('reveals invalid text notes when saving from the image tab', async () => {
    const wrapper = mountForm({}, true)
    await flushPromises()
    textInput(wrapper).vm.$emit('update:value', 'x'.repeat(1001))
    await switchTab(wrapper, 1)
    await button(wrapper, t('common.actions.save')).trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(tabs(wrapper).props('value')).toBe('text')
    expect(textPane(wrapper).isVisible()).toBe(true)
  })

  it('keeps the detail notes card with a header switch and preserves previews across content changes', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    const wrapper = mountDetail()
    await flushPromises()
    const card = wrapper.findAllComponents(NCard).find(item => item.props('title') === t('common.labels.notes'))!
    const headerSwitch = card.get('.n-card-header__extra').getComponent(NRadioGroup)
    expect(headerSwitch.props('size')).toBe('small')
    expect(headerSwitch.findAllComponents(NRadioButton).map(item => item.text())).toEqual([
      t('subscriptions.detail.notesText'), t('subscriptions.detail.notesImages', { count: 1 })
    ])
    expect(wrapper.findComponent(NTabs).exists()).toBe(false)
    expect(card.get('.detail-notes').isVisible()).toBe(true)
    expect(wrapper.getComponent(SubscriptionImages).isVisible()).toBe(false)
    const controller = controllerOf(wrapper)
    await switchDetailNotes(wrapper, 'images')
    expect(wrapper.getComponent(SubscriptionImages).isVisible()).toBe(true)
    expect(card.get('.detail-notes').isVisible()).toBe(false)
    expect(wrapper.getComponent(SubscriptionImages).props('readonly')).toBe(true)
    await switchDetailNotes(wrapper, 'text')
    await switchDetailNotes(wrapper, 'images')
    expect(controllerOf(wrapper)).toBe(controller)
    expect(api.getSubscriptionImages).toHaveBeenCalledTimes(1)
    expect(api.getSubscriptionImageContent).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await wrapper.setProps({ detail: { ...detail, id: 'second' } })
    await flushPromises()
    expect(headerSwitch.props('value')).toBe('text')
    await switchDetailNotes(wrapper, 'images')
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    expect(headerSwitch.props('value')).toBe('text')
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
  })

  it('updates the detail image count after loading and clears it for another subscription', async () => {
    const listing = deferred<SubscriptionImage[]>()
    vi.mocked(api.getSubscriptionImages).mockReturnValueOnce(listing.promise)
    const wrapper = mountDetail()
    await nextTick()
    const imageButton = () => wrapper.getComponent(NRadioGroup).findAllComponents(NRadioButton).find(item => item.props('value') === 'images')!
    expect(imageButton().text()).toBe(t('subscriptions.detail.notesImages', { count: 0 }))
    listing.resolve([metadata('first'), metadata('second'), metadata('third')])
    await flushPromises()
    expect(imageButton().text()).toBe(t('subscriptions.detail.notesImages', { count: 3 }))
    await switchDetailNotes(wrapper, 'images')
    expect(imageButton().text()).toBe(t('subscriptions.detail.notesImages', { count: 3 }))
    await wrapper.setProps({ detail: { ...detail, id: 'empty' } })
    await flushPromises()
    expect(imageButton().text()).toBe(t('subscriptions.detail.notesImages', { count: 0 }))
  })

  it('shows the relevant empty state when switching an empty notes card', async () => {
    const wrapper = mountDetail({ detail: { ...detail, notes: '' } })
    await flushPromises()
    expect(wrapper.get('.detail-notes').text()).toBe(t('common.empty.noNotes'))
    expect(wrapper.get('.detail-notes').isVisible()).toBe(true)
    await switchDetailNotes(wrapper, 'images')
    expect(wrapper.get('.detail-notes').isVisible()).toBe(false)
    expect(wrapper.getComponent(SubscriptionImages).text()).toContain(t('subscriptions.images.empty'))
    expect(wrapper.getComponent(SubscriptionImages).isVisible()).toBe(true)
    expect(api.getSubscriptionImageContent).not.toHaveBeenCalled()
  })

  it('reveals failed detail image loading and retries within the notes card', async () => {
    vi.mocked(api.getSubscriptionImages).mockRejectedValueOnce(new Error('Offline'))
    const wrapper = mountDetail()
    await flushPromises()
    expect(wrapper.getComponent(NRadioGroup).props('value')).toBe('images')
    expect(wrapper.getComponent(SubscriptionImages).isVisible()).toBe(true)
    expect(wrapper.getComponent(SubscriptionImages).text()).toContain(t('subscriptions.images.loadFailed'))
    await button(wrapper, t('subscriptions.images.retry')).trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(SubscriptionImages).text()).toContain(t('subscriptions.images.empty'))
    await switchDetailNotes(wrapper, 'text')
    expect(wrapper.get('.detail-notes').text()).toBe(original.notes)
  })
})

describe('SubscriptionImages stale results and private detail previews', () => {
  it('ignores old metadata and cleans a late upload after source switching', async () => {
    const list = deferred<SubscriptionImage[]>()
    vi.mocked(api.getSubscriptionImages).mockReturnValueOnce(list.promise).mockResolvedValueOnce([metadata('second')])
    const { controller, source } = harness('first')
    source.id = 'second'
    await flushPromises()
    list.resolve([metadata('first')])
    await flushPromises()
    expect(controller.selection()?.imageIds).toEqual(['second'])
    const upload = deferred<SubscriptionImage>()
    vi.mocked(api.uploadSubscriptionImage).mockReturnValueOnce(upload.promise)
    const task = controller.uploadFiles([file()])
    await vi.waitFor(() => expect(api.uploadSubscriptionImage).toHaveBeenCalled())
    source.id = 'third'
    await flushPromises()
    upload.resolve(metadata('late-upload'))
    await task
    expect(api.deleteSubscriptionImage).toHaveBeenCalledWith('late-upload')
    expect(controller.selection()?.imageIds).toEqual([])
  })

  it('keeps saved bindings when a preview fails, and supports retrying the private content read', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    vi.mocked(api.getSubscriptionImageContent).mockRejectedValueOnce(new Error('Offline'))
    const { controller } = harness('original')
    await flushPromises()
    expect(controller.selection()?.imageIds).toEqual(['saved'])
    expect(controller.state.images[0].previewFailed).toBe(true)
    await controller.retryPreview('saved')
    expect(controller.state.images[0].previewFailed).toBe(false)
    expect(controller.state.images[0].previewUrl).toMatch(/^blob:private-/)
  })

  it('does not create a blob URL after close, can reopen, and revokes visible URLs on logout', async () => {
    saveAuthSession('token', 'owner')
    const blob = deferred<Blob>()
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    vi.mocked(api.getSubscriptionImageContent).mockReturnValueOnce(blob.promise)
    const { controller, source } = harness('original')
    await flushPromises()
    source.active = false
    await nextTick()
    blob.resolve(new Blob([png]))
    await flushPromises()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    source.active = true
    await flushPromises()
    expect(controller.ready.value).toBe(true)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    clearAuthSession()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(controller.state.images).toEqual([])
    expect(controller.ready.value).toBe(false)
  })

  it('loads read-only drawer images only when opened and releases previews on close', async () => {
    vi.mocked(api.getSubscriptionImages).mockResolvedValue([metadata('saved')])
    const wrapper = shallowMount(SubscriptionDetailDrawer, {
      props: { show: false, detail }, global: { renderStubDefaultSlot: true, stubs: { SubscriptionImages: false, Button: false, BaseWave: false } }
    })
    wrappers.push(wrapper)
    expect(api.getSubscriptionImages).not.toHaveBeenCalled()
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(api.getSubscriptionImages).toHaveBeenCalledWith('original')
    expect(wrapper.findAllComponents(NImage)).toHaveLength(1)
    expect(wrapper.getComponent(NImage).props('src')).toMatch(/^blob:private-/)
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(button(wrapper, t('subscriptions.images.remove'))).toBeUndefined()
    await wrapper.setProps({ show: false })
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(NImage).exists()).toBe(false)
    expect(api.deleteSubscriptionImage).not.toHaveBeenCalled()
  })
})
