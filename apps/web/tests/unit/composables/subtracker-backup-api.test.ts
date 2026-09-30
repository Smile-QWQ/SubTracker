import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { api } from '@/composables/api'

const adapter = vi.hoisted(() => vi.fn())
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, create: (config: object) => actual.default.create({ ...config, adapter }) } }
})

beforeEach(() => {
  adapter.mockReset()
  adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => ({
    config, status: 200, statusText: 'OK', headers: {}, data: { data: { token: 'one-use-token' } }
  }))
})
function request() { return adapter.mock.calls.at(-1)![0] as InternalAxiosRequestConfig }

describe('native backup streaming API', () => {
  it('uses a short-lived ticket for browser-managed downloads and raw file uploads', async () => {
    const result = await api.exportBackup(false)
    expect('downloadUrl' in result && result.downloadUrl).toContain('/settings/export/backup/download/one-use-token')
    expect(request().method).toBe('post')
    expect(JSON.parse(request().data)).toEqual({ includeSubscriptionImages: false, format: 'standard' })
    expect(request().responseType).not.toBe('blob')
    expect(request().url).toBe('/settings/export/backup')
    expect(request().timeout).toBe(120000)
    const file = new File(['ZIP'], 'backup.zip', { type: 'application/zip' })
    const controller = new AbortController()
    await api.inspectSubtrackerBackup(file, { signal: controller.signal })
    expect(request().data).toBe(file)
    expect(request().signal).toBe(controller.signal)
    expect(request().headers.getContentType()).toBe('application/zip')
    expect(request().url).toBe('/import/subtracker/inspect')
    expect(request().timeout).toBe(0)
    await api.commitSubtrackerBackup({ importToken: 'preview', mode: 'replace', restoreSettings: true })
    expect(request().url).toBe('/import/subtracker/commit')
    expect(request().timeout).toBe(1800000)
  })

  it('sends the legacy format explicitly without buffering the download', async () => {
    await api.exportBackup(false, 'legacy-v0.11')
    expect(JSON.parse(request().data)).toEqual({ includeSubscriptionImages: false, format: 'legacy-v0.11' })
    expect(request().responseType).not.toBe('blob')
  })

  it('returns missing-file preflight data without constructing a download URL and sends scoped consent', async () => {
    const missingAssets = [{ kind: 'logo', path: 'logos/gone.png', fileName: 'gone.png', subscriptions: [] }]
    adapter.mockImplementationOnce(async (config: InternalAxiosRequestConfig) => ({
      config, status: 200, statusText: 'OK', headers: {}, data: { data: { missingAssets } }
    }))
    expect(await api.exportBackup()).toEqual({ missingAssets })
    await api.exportBackup(true, 'standard', ['logos/gone.png'])
    expect(JSON.parse(request().data)).toEqual({ includeSubscriptionImages: true, format: 'standard', confirmedMissingAssets: ['logos/gone.png'] })
  })

  it('keeps ordinary API requests at the existing 30-second default', async () => {
    await api.getSubscriptions()
    expect(request().timeout).toBe(30000)
    await api.commitWallosImport('preview')
    expect(request().timeout).toBe(30000)
  })
})
