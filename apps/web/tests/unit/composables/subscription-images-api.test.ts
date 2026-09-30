import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { api } from '@/composables/api'
import { clearAuthSession, saveAuthSession } from '@/utils/auth-storage'

const adapter = vi.hoisted(() => vi.fn())
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, create: (config: object) => actual.default.create({ ...config, adapter }) } }
})
const image = { id: 'image', fileName: 'image.png', contentType: 'image/png', size: 8, createdAt: '2026-01-01' }

beforeEach(() => {
  adapter.mockReset()
  saveAuthSession('private-token', 'owner')
})
afterEach(() => clearAuthSession())
function respond(data: unknown) {
  adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => ({ config, status: 200, statusText: 'OK', headers: {}, data }))
}
function request() { return adapter.mock.calls.at(-1)![0] as InternalAxiosRequestConfig }

describe('subscription image API client', () => {
  it('fetches private content as authenticated blobs, never with token query parameters', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    respond(blob)
    expect(await api.getSubscriptionImageContent('private/id')).toBe(blob)
    expect(request().url).toBe('/subscription-images/private%2Fid/content')
    expect(request().responseType).toBe('blob')
    expect(request().headers.Authorization).toBe('Bearer private-token')
    expect(request().params).toBeUndefined()
  })

  it('unwraps image metadata and uses the agreed upload field names', async () => {
    respond({ data: image })
    const payload = { fileName: 'looks-like.png', contentType: 'image/svg+xml', dataBase64: 'PHN2Zy8+', svgConfirmed: true }
    expect(await api.uploadSubscriptionImage(payload)).toEqual(image)
    expect(request().url).toBe('/subscription-images/upload')
    expect(JSON.parse(request().data)).toEqual(payload)
    expect(request().timeout).toBe(60000)
    expect(request().headers.Authorization).toBe('Bearer private-token')
  })

  it('does not share pending URL imports between cancelled and reopened editor sessions', async () => {
    respond({ data: { requiresConfirmation: false, image } })
    await Promise.all([
      api.importSubscriptionImage({ url: 'https://example.com/image' }),
      api.importSubscriptionImage({ url: 'https://example.com/image' })
    ])
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('uses metadata listing, URL import and pending-only deletion endpoints', async () => {
    respond({ data: [image] })
    expect(await api.getSubscriptionImages('subscription/id')).toEqual([image])
    expect(request().url).toBe('/subscriptions/subscription%2Fid/images')
    const result = { requiresConfirmation: false, image }
    respond({ data: result })
    expect(await api.importSubscriptionImage({ url: 'https://example.com/image' })).toEqual(result)
    expect(request().url).toBe('/subscription-images/import')
    expect(JSON.parse(request().data)).toEqual({ url: 'https://example.com/image' })
    respond({ data: { deleted: true } })
    await api.deleteSubscriptionImage('pending/id')
    expect(request().url).toBe('/subscription-images/pending%2Fid')
    expect(request().method).toBe('delete')
  })
})
