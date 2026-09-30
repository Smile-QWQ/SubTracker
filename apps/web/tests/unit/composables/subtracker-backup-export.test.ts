import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useSubtrackerBackupExport } from '@/composables/subtracker-backup-export'

const mocks = vi.hoisted(() => ({ exportBackup: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/composables/api', () => ({ api: { exportBackup: mocks.exportBackup } }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => ({ success: mocks.success, error: mocks.error }) }))

let wrapper: ReturnType<typeof mount> | undefined
let state: ReturnType<typeof useSubtrackerBackupExport>
let click: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  mocks.exportBackup.mockResolvedValue({ downloadUrl: '/api/v1/settings/export/backup/download/ticket' })
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  wrapper = mount(defineComponent({ setup() { state = useSubtrackerBackupExport(); return () => null } }))
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

describe('backup export confirmation', () => {
  it('defaults to a standard backup including images without a legacy prompt', async () => {
    await state.exportBackup()
    expect(mocks.exportBackup).toHaveBeenCalledWith(true, 'standard', [])
    expect(state.showLegacyBackupConfirmation.value).toBe(false)
    expect(click).toHaveBeenCalledOnce()
  })

  it('does not request or download a legacy backup until confirmation, and cancellation is harmless', async () => {
    state.backupFormat.value = 'legacy-v0.11'
    await state.exportBackup()
    expect(state.showLegacyBackupConfirmation.value).toBe(true)
    expect(mocks.exportBackup).not.toHaveBeenCalled()
    state.showLegacyBackupConfirmation.value = false
    await state.confirmLegacyBackupExport()
    expect(mocks.exportBackup).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    await state.exportBackup()
    await state.confirmLegacyBackupExport()
    expect(mocks.exportBackup).toHaveBeenCalledExactlyOnceWith(false, 'legacy-v0.11', [])
    expect(click).toHaveBeenCalledOnce()
    expect(state.includeBackupImages.value).toBe(true)
  })

  it('preserves the standard image preference when switching formats', async () => {
    state.includeBackupImages.value = false
    state.backupFormat.value = 'legacy-v0.11'
    state.backupFormat.value = 'standard'
    await state.exportBackup()
    expect(mocks.exportBackup).toHaveBeenCalledWith(false, 'standard', [])
  })

  it('keeps failed legacy preparation from triggering a download and permits retry', async () => {
    mocks.exportBackup.mockRejectedValueOnce(new Error('750 KiB limit'))
    state.backupFormat.value = 'legacy-v0.11'
    state.exportBackup()
    await state.confirmLegacyBackupExport()
    expect(mocks.error).toHaveBeenCalledWith('750 KiB limit')
    expect(click).not.toHaveBeenCalled()
    expect(state.exportingBackup.value).toBe(false)
    state.exportBackup()
    await state.confirmLegacyBackupExport()
    expect(click).toHaveBeenCalledOnce()
  })

  const missing = [{ kind: 'logo', path: 'logos/missing.png', fileName: 'missing.png', subscriptions: [{ id: 's1', name: '<img src=x>' }] }]

  it('requires confirmation for missing files and cancels without downloading', async () => {
    mocks.exportBackup.mockResolvedValueOnce({ missingAssets: missing })
    await state.exportBackup()
    expect(state.showMissingBackupConfirmation.value).toBe(true)
    expect(state.missingBackupAssets.value).toEqual(missing)
    expect(click).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    await state.exportBackup()
    expect(mocks.exportBackup).toHaveBeenCalledOnce()
    state.cancelMissingBackupExport()
    await state.confirmMissingBackupExport()
    expect(mocks.exportBackup).toHaveBeenCalledOnce()
    expect(state.missingBackupAssets.value).toEqual([])
    await state.exportBackup()
    expect(mocks.exportBackup).toHaveBeenLastCalledWith(true, 'standard', [])
    expect(click).toHaveBeenCalledOnce()
  })

  it('freezes the requested options and confirms only the displayed missing files', async () => {
    mocks.exportBackup.mockResolvedValueOnce({ missingAssets: missing })
    state.includeBackupImages.value = false
    await state.exportBackup()
    state.backupFormat.value = 'legacy-v0.11'
    state.includeBackupImages.value = true
    await state.confirmMissingBackupExport()
    expect(mocks.exportBackup).toHaveBeenLastCalledWith(false, 'standard', ['logos/missing.png'])
    expect(state.showMissingBackupConfirmation.value).toBe(false)
    expect(click).toHaveBeenCalledOnce()
    await state.confirmMissingBackupExport()
    expect(click).toHaveBeenCalledOnce()
  })

  it('prompts again if more files disappear and supports the legacy confirmation flow', async () => {
    state.backupFormat.value = 'legacy-v0.11'
    mocks.exportBackup.mockResolvedValueOnce({ missingAssets: missing })
    state.exportBackup()
    await state.confirmLegacyBackupExport()
    expect(state.showMissingBackupConfirmation.value).toBe(true)
    const more = [...missing, { ...missing[0], path: 'logos/new.png' }]
    mocks.exportBackup.mockResolvedValueOnce({ missingAssets: more })
    expect(await state.confirmMissingBackupExport()).toBe(false)
    expect(state.showMissingBackupConfirmation.value).toBe(true)
    expect(click).not.toHaveBeenCalled()
    await state.confirmMissingBackupExport()
    expect(mocks.exportBackup).toHaveBeenLastCalledWith(false, 'legacy-v0.11', more.map(asset => asset.path))
    expect(click).toHaveBeenCalledOnce()
  })

  it('does not open a late missing-file prompt after leaving settings', async () => {
    let resolve!: (value: unknown) => void
    mocks.exportBackup.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    void state.exportBackup()
    wrapper!.unmount()
    wrapper = undefined
    resolve({ missingAssets: missing })
    await flushPromises()
    expect(state.showMissingBackupConfirmation.value).toBe(false)
    expect(click).not.toHaveBeenCalled()
  })

  it('serializes exports and ignores late results after leaving settings', async () => {
    let resolve!: (value: { downloadUrl: string }) => void
    mocks.exportBackup.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    void state.exportBackup()
    void state.exportBackup()
    expect(mocks.exportBackup).toHaveBeenCalledOnce()
    wrapper!.unmount()
    wrapper = undefined
    resolve({ downloadUrl: '/late' })
    await flushPromises()
    expect(click).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
