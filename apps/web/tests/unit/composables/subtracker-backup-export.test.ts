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
    expect(mocks.exportBackup).toHaveBeenCalledWith(true)
    expect(click).toHaveBeenCalledOnce()
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
