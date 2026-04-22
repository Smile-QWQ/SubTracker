import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function svgBuffer(width = 128, height = 128) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#0ea5e9"/></svg>`,
    'utf8'
  )
}

function mockResponse(body: string | Buffer, init?: { status?: number; contentType?: string; url?: string }) {
  const payload = typeof body === 'string' ? body : new Uint8Array(body)
  return new Response(payload, {
    status: init?.status ?? 200,
    headers: init?.contentType
      ? {
          'content-type': init.contentType
        }
      : undefined
  })
}

describe('logo search regression', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses real search candidates for chinese names without degrading to fake .com favicon fallbacks', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('https://duckduckgo.com/?q=')) {
        return mockResponse('<html><body>vqd="123-456"</body></html>', { contentType: 'text/html' })
      }

      if (url.startsWith('https://duckduckgo.com/i.js?')) {
        return mockResponse(
          JSON.stringify({
            results: [
              {
                image: 'https://img.example/bilibili.svg',
                width: 256,
                height: 256
              }
            ]
          }),
          { contentType: 'application/json' }
        )
      }

      if (url === 'https://img.example/bilibili.svg') {
        return mockResponse(svgBuffer(256, 256), { contentType: 'image/svg+xml' })
      }

      return mockResponse('not found', { status: 404, contentType: 'text/plain' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { searchSubscriptionLogos } = await import('../../src/services/logo.service')
    const results = await searchSubscriptionLogos({
      name: '哔哩哔哩',
      websiteUrl: '',
      tagName: ''
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.some((item) => item.logoUrl === 'https://img.example/bilibili.svg')).toBe(true)
    expect(results.some((item) => item.source === 'google-favicon')).toBe(false)
    expect(results.some((item) => item.websiteUrl === 'https://.com')).toBe(false)
  })

  it('keeps lightweight DuckDuckGo-first aggregated results without probing every remote image', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('https://duckduckgo.com/?q=')) {
        return mockResponse('<html><body>vqd="4-987654321"</body></html>', { contentType: 'text/html' })
      }

      if (url.startsWith('https://duckduckgo.com/i.js?')) {
        const results = Array.from({ length: 18 }, (_, index) => ({
          image: `https://img.example/ddg-${index + 1}.svg`,
          width: 256 + index,
          height: 256 + index
        }))
        return mockResponse(
          JSON.stringify({
            results
          }),
          { contentType: 'application/json' }
        )
      }

      return mockResponse('not found', { status: 404, contentType: 'text/plain' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { searchSubscriptionLogos } = await import('../../src/services/logo.service')
    const results = await searchSubscriptionLogos({
      name: '哔哩哔哩',
      websiteUrl: '',
      tagName: ''
    })

    expect(results).toHaveLength(12)
    expect(results.every((item) => item.source === 'duckduckgo')).toBe(true)
    expect(results.filter((item) => item.source === 'brave').length).toBe(0)
    expect(fetchMock.mock.calls.some(([input]) => /^https:\/\/img\.example\/(ddg|brave)-\d+\.svg$/.test(String(input)))).toBe(false)
  })

  it('extracts icon candidates from explicit website html instead of relying only on generic favicon services', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === 'https://service.example') {
        return mockResponse('<html><head><link rel="icon" href="/logo.svg" /></head></html>', {
          contentType: 'text/html'
        })
      }

      if (url.startsWith('https://duckduckgo.com/?q=')) {
        return mockResponse('<html><body>no-vqd</body></html>', { contentType: 'text/html' })
      }

      return mockResponse('not found', { status: 404, contentType: 'text/plain' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { searchSubscriptionLogos } = await import('../../src/services/logo.service')
    const results = await searchSubscriptionLogos({
      name: 'Service Example',
      websiteUrl: 'https://service.example',
      tagName: ''
    })

    expect(results.some((item) => item.logoUrl === 'https://service.example/logo.svg')).toBe(true)
    expect(results.some((item) => item.source === 'html-icon')).toBe(true)
  })

  it('does not probe remote candidate images during worker search, avoiding extra cpu-heavy fetches', async () => {
    const imageRequests: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('https://duckduckgo.com/?q=')) {
        return mockResponse('<html><body>vqd="123-456"</body></html>', { contentType: 'text/html' })
      }

      if (url.startsWith('https://duckduckgo.com/i.js?')) {
        return mockResponse(
          JSON.stringify({
            results: [
              {
                image: 'https://img.example/ddg-worker-only.png',
                width: 282,
                height: 320
              }
            ]
          }),
          { contentType: 'application/json' }
        )
      }

      if (url === 'https://img.example/ddg-worker-only.png') {
        imageRequests.push(url)
        return mockResponse('forbidden', { status: 403, contentType: 'text/plain' })
      }

      return mockResponse('not found', { status: 404, contentType: 'text/plain' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { searchSubscriptionLogos } = await import('../../src/services/logo.service')
    const results = await searchSubscriptionLogos({
      name: '哔哩哔哩',
      websiteUrl: '',
      tagName: ''
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.logoUrl).toBe('https://img.example/ddg-worker-only.png')
    expect(imageRequests).toHaveLength(0)
  })

  it('caps remote image probes to keep worker cpu usage lower under heavy search results', async () => {
    const imageRequests: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('https://duckduckgo.com/?q=')) {
        return mockResponse('<html><body>vqd="4-987654321"</body></html>', { contentType: 'text/html' })
      }

      if (url.startsWith('https://duckduckgo.com/i.js?')) {
        const results = Array.from({ length: 40 }, (_, index) => ({
          image: `https://img.example/ddg-heavy-${index + 1}.svg`,
          width: 256,
          height: 256
        }))
        return mockResponse(JSON.stringify({ results }), { contentType: 'application/json' })
      }

      if (/^https:\/\/img\.example\/ddg-heavy-\d+\.svg$/.test(url)) {
        imageRequests.push(url)
        return mockResponse(svgBuffer(256, 256), { contentType: 'image/svg+xml' })
      }

      return mockResponse('not found', { status: 404, contentType: 'text/plain' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { searchSubscriptionLogos } = await import('../../src/services/logo.service')
    const results = await searchSubscriptionLogos({
      name: 'Heavy Search',
      websiteUrl: '',
      tagName: ''
    })

    expect(results.length).toBeLessThanOrEqual(12)
    expect(imageRequests.length).toBe(0)
  })
})
