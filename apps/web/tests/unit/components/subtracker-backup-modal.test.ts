import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { NButton, NRadioGroup } from 'naive-ui'
import SubtrackerBackupModal from '@/components/SubtrackerBackupModal.vue'
import { api } from '@/composables/api'
import { t } from '@/locales'
import type { SubtrackerBackupCommitResult, SubtrackerBackupInspectResult } from '@/types/api'

const messages = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => messages }))
vi.mock('@/composables/api', () => ({ api: { inspectSubtrackerBackup: vi.fn(), commitSubtrackerBackup: vi.fn(), getSubtrackerBackupLimits: vi.fn(), discardSubtrackerBackup: vi.fn() } }))

const preview: SubtrackerBackupInspectResult = {
  isSubtrackerBackup: true,
  importToken: 'preview-token',
  summary: { scope: 'business-complete', subscriptionsTotal: 2, tagsTotal: 1, paymentRecordsTotal: 3, logosTotal: 4, includesSettings: true },
  warnings: [], availableModes: ['replace', 'append'],
  conflicts: { existingTagNameCount: 0, existingSubscriptionIdCount: 0, existingPaymentRecordIdCount: 0, canRestoreSettings: true }
}
const restored: SubtrackerBackupCommitResult = {
  mode: 'replace', clearedExistingData: true, restoredSettings: true,
  importedTags: 1, reusedTags: 0, importedSubscriptions: 2, skippedSubscriptions: 0,
  importedPaymentRecords: 3, skippedPaymentRecords: 0, importedLogos: 4, warnings: []
}
const wrappers: VueWrapper[] = []
function mountModal() {
  const wrapper = shallowMount(SubtrackerBackupModal, {
    props: { show: true }, global: { renderStubDefaultSlot: true, stubs: { Button: false, BaseWave: false } }
  })
  wrappers.push(wrapper)
  return wrapper
}
function button(wrapper: VueWrapper, label: string) {
  return wrapper.findAllComponents(NButton).find(item => item.text() === label)!
}
async function select(wrapper: VueWrapper, size = 8) {
  const input = wrapper.get('input[type="file"]')
  const file = new File(['small fixture'], 'backup.zip', { type: 'application/zip' })
  // Test configured boundaries without allocating a multi-GiB browser fixture.
  Object.defineProperty(file, 'size', { value: size })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}
async function inspect(wrapper: VueWrapper) {
  await select(wrapper)
  await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
  await vi.waitFor(() => expect(api.inspectSubtrackerBackup).toHaveBeenCalled())
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getSubtrackerBackupLimits).mockResolvedValue({ maxArchiveBytes: 2 * 1024 ** 3, maxExpandedBytes: 2 * 1024 ** 3 })
  vi.mocked(api.discardSubtrackerBackup).mockResolvedValue({ deleted: true })
  vi.mocked(api.inspectSubtrackerBackup).mockResolvedValue(preview)
  vi.mocked(api.commitSubtrackerBackup).mockResolvedValue(restored)
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('SubtrackerBackupModal note-image counts and ZIP size limit', () => {
  it.each([undefined, 7])('shows note images independently of logos with optional count %s', async images => {
    vi.mocked(api.inspectSubtrackerBackup).mockResolvedValue({ ...preview, summary: { ...preview.summary, subscriptionImagesTotal: images } })
    const wrapper = mountModal()
    await inspect(wrapper)
    const labels = wrapper.findAll('.summary-label').map(item => item.text())
    const values = wrapper.findAll('.summary-value').map(item => item.text())
    expect(values[labels.indexOf(t('subscriptions.backupModal.localLogos'))]).toBe('4')
    expect(values[labels.indexOf(t('subscriptions.backupModal.subscriptionImages'))]).toBe(String(images ?? 0))
  })

  it.each([undefined, 7])('includes restored note images in the success message with optional count %s', async images => {
    vi.mocked(api.commitSubtrackerBackup).mockResolvedValue({ ...restored, importedSubscriptionImages: images })
    const wrapper = mountModal()
    await inspect(wrapper)
    await button(wrapper, t('subscriptions.backupModal.confirmRestore')).trigger('click')
    await flushPromises()
    expect(messages.success).toHaveBeenLastCalledWith(t('subscriptions.backupModal.restoreCompleted', {
      subscriptions: 2, tags: 1, payments: 3, logos: 4, images: images ?? 0
    }))
    expect(wrapper.emitted('imported')).toEqual([[{ mode: 'replace', restoredSettings: true }]])
  })

  it('does not report nothing imported when append mode imports only note images', async () => {
    vi.mocked(api.commitSubtrackerBackup).mockResolvedValue({
      ...restored, mode: 'append', importedSubscriptions: 0, importedTags: 0,
      importedPaymentRecords: 0, importedLogos: 0, importedSubscriptionImages: 2
    })
    const wrapper = mountModal()
    await inspect(wrapper)
    wrapper.getComponent(NRadioGroup).vm.$emit('update:value', 'append')
    await button(wrapper, t('subscriptions.backupModal.confirmRestore')).trigger('click')
    await flushPromises()
    expect(messages.success).toHaveBeenLastCalledWith(t('subscriptions.backupModal.restoreCompleted', {
      subscriptions: 0, tags: 0, payments: 0, logos: 0, images: 2
    }))
    expect(messages.success).not.toHaveBeenCalledWith(t('subscriptions.backupModal.nothingImported'))
  })

  it('warns explicitly when restoring a lightweight backup', async () => {
    vi.mocked(api.inspectSubtrackerBackup).mockResolvedValue({ ...preview, summary: { ...preview.summary, includesSubscriptionImages: false } })
    const wrapper = mountModal()
    await inspect(wrapper)
    expect(wrapper.text()).toContain(t('subscriptions.backupModal.withoutImages'))
  })

  it('uses server-configured limits rather than a hardcoded client ceiling', async () => {
    vi.mocked(api.getSubtrackerBackupLimits).mockResolvedValue({ maxArchiveBytes: 3 * 1024 ** 3, maxExpandedBytes: 4 * 1024 ** 3 })
    const wrapper = mountModal()
    await select(wrapper, 2 * 1024 ** 3 + 1)
    await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
    await flushPromises()
    expect(api.inspectSubtrackerBackup).toHaveBeenCalled()
    expect(messages.error).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('3 GiB')
    expect(wrapper.text()).toContain('4 GiB')
  })

  it('discards the server-side preview when the modal closes', async () => {
    const wrapper = mountModal()
    await inspect(wrapper)
    await button(wrapper, t('common.actions.cancel')).trigger('click')
    expect(api.discardSubtrackerBackup).toHaveBeenCalledWith('preview-token')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('aborts an upload and discards a late preview without showing stale success', async () => {
    let resolve!: (value: SubtrackerBackupInspectResult) => void
    vi.mocked(api.inspectSubtrackerBackup).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = mountModal()
    await select(wrapper)
    await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
    await flushPromises()
    const signal = vi.mocked(api.inspectSubtrackerBackup).mock.calls[0][1]!.signal!
    await button(wrapper, t('common.actions.cancel')).trigger('click')
    expect(signal.aborted).toBe(true)
    resolve(preview)
    await flushPromises()
    expect(api.discardSubtrackerBackup).toHaveBeenCalledWith(preview.importToken)
    expect(messages.success).not.toHaveBeenCalled()
    expect(button(wrapper, t('subscriptions.backupModal.confirmRestore')).props('disabled')).toBe(true)
  })

  it('drops a stale result after another file is selected', async () => {
    let resolve!: (value: SubtrackerBackupInspectResult) => void
    vi.mocked(api.inspectSubtrackerBackup).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = mountModal()
    await select(wrapper)
    await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
    await flushPromises()
    await select(wrapper, 100)
    resolve(preview)
    await flushPromises()
    expect(api.discardSubtrackerBackup).toHaveBeenCalledWith(preview.importToken)
    expect(wrapper.findAll('.summary-value')).toHaveLength(0)
    await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.summary-value')).toHaveLength(5)
  })

  it('blocks closing during restore and requires a new preview after failure', async () => {
    let reject!: (reason: Error) => void
    vi.mocked(api.commitSubtrackerBackup).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const wrapper = mountModal()
    await inspect(wrapper)
    await button(wrapper, t('subscriptions.backupModal.confirmRestore')).trigger('click')
    expect(button(wrapper, t('common.actions.cancel')).props('disabled')).toBe(true)
    await button(wrapper, t('common.actions.cancel')).trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    reject(new Error('restore failed'))
    await flushPromises()
    expect(messages.error).toHaveBeenCalledWith('restore failed')
    expect(button(wrapper, t('subscriptions.backupModal.confirmRestore')).props('disabled')).toBe(true)
    expect(api.discardSubtrackerBackup).toHaveBeenCalledWith(preview.importToken)
  })

  it('rejects ZIPs above the configured limit without reading the file', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    const wrapper = mountModal()
    await select(wrapper, 2 * 1024 ** 3 + 1)
    await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
    await flushPromises()
    expect(read).not.toHaveBeenCalled()
    expect(api.inspectSubtrackerBackup).not.toHaveBeenCalled()
    expect(messages.error).toHaveBeenCalledWith(t('subscriptions.backupModal.backupTooLarge', { limit: '2 GiB' }))
    expect(button(wrapper, t('subscriptions.backupModal.confirmRestore')).props('disabled')).toBe(true)
  })

  it('sends the original File at exactly 2 GiB without a FileReader or base64 allocation', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    const wrapper = mountModal()
    await select(wrapper, 2 * 1024 ** 3)
    await button(wrapper, t('subscriptions.backupModal.previewBackup')).trigger('click')
    await vi.waitFor(() => expect(api.inspectSubtrackerBackup).toHaveBeenCalled())
    expect(read).not.toHaveBeenCalled()
    expect(messages.error).not.toHaveBeenCalled()
    expect(api.inspectSubtrackerBackup).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }))
  })
})
