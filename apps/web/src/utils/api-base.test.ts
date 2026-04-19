import { describe, expect, it } from 'vitest'
import { getApiBaseUrl, resolveApiOrigin, resolveAssetUrl } from '@/utils/api-base'

describe('api-base utils', () => {
  it('uses relative /api/v1 as default api base url', () => {
    expect(getApiBaseUrl()).toBe('/api/v1')
    expect(getApiBaseUrl('')).toBe('/api/v1')
  })

  it('resolves api origin from relative base url', () => {
    expect(resolveApiOrigin('/api/v1', 'https://subtracker.example.com')).toBe('https://subtracker.example.com')
  })

  it('resolves api origin from absolute base url', () => {
    expect(resolveApiOrigin('https://api.example.com/api/v1', 'https://subtracker.example.com')).toBe('https://api.example.com')
  })

  it('resolves logo/static asset url from relative api base', () => {
    expect(resolveAssetUrl('/static/logos/demo.png', '/api/v1', 'https://subtracker.example.com')).toBe(
      'https://subtracker.example.com/static/logos/demo.png'
    )
  })

  it('keeps absolute asset url unchanged', () => {
    expect(resolveAssetUrl('https://cdn.example.com/demo.png', '/api/v1', 'https://subtracker.example.com')).toBe(
      'https://cdn.example.com/demo.png'
    )
  })
})
