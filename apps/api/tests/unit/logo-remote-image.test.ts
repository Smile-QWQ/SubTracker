import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import http, { type IncomingHttpHeaders, type IncomingMessage, type RequestOptions } from 'node:http'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import type { LookupAddress, LookupAllOptions } from 'node:dns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRemoteBody, inspectDownloadedImage, inspectRasterImage, REMOTE_IMAGE_MAX_BYTES, RemoteImageTooLargeError } from '../../src/utils/remote-image'
import { additionalLogos, avifLogo, bmpLogo, gifLogo, icoLogo, jpegLogo, losslessWebpLogo, pngLogo, webpLogo } from './logo-fixtures'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
const lookupAll = vi.mocked(lookup as (hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>)

type ResponsePlan = {
  status?: number
  headers?: IncomingHttpHeaders
  chunks?: Buffer[]
  complete?: boolean
  stallHeaders?: boolean
  stallBody?: boolean
  interrupted?: boolean
  error?: Error
}

describe('logo remote-image public Internet transport', () => {
  const plans: ResponsePlan[] = []
  const calls: Array<{ url: URL; options: RequestOptions; response?: PassThrough }> = []
  const connectedAddresses: string[] = []

  beforeEach(() => {
    plans.length = 0
    calls.length = 0
    connectedAddresses.length = 0
    lookupAll.mockReset()
    lookupAll.mockResolvedValue([{ address: '93.184.215.14', family: 4 }])

    const request = ((url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const plan = plans.shift() ?? {}
      const call: (typeof calls)[number] = { url, options }
      calls.push(call)
      const req = new EventEmitter() as EventEmitter & { end: () => void }
      const onAbort = () => {
        req.emit('error', options.signal?.reason)
        call.response?.destroy(options.signal?.reason)
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      req.end = () => {
        options.lookup!(url.hostname, { all: false }, (error, address) => {
          if (error) throw error
          connectedAddresses.push(address as string)
        })
        queueMicrotask(() => {
          if (plan.error) { req.emit('error', plan.error); return }
          if (plan.stallHeaders) return
          const response = Object.assign(new PassThrough(), {
            statusCode: plan.status ?? 200,
            headers: plan.headers ?? { 'content-type': 'image/png' },
            complete: plan.complete ?? true
          })
          call.response = response
          response.on('close', () => options.signal?.removeEventListener('abort', onAbort))
          callback(response as unknown as IncomingMessage)
          for (const chunk of plan.chunks ?? [pngLogo]) {
            if (!response.destroyed) response.write(chunk)
          }
          if (plan.interrupted) response.emit('aborted')
          if (!plan.stallBody) response.end()
        })
      }
      return req
    }) as typeof http.request
    vi.spyOn(http, 'request').mockImplementation(request)
    vi.spyOn(https, 'request').mockImplementation(request)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    'file:///etc/passwd', 'ftp://example.com/logo.png', 'data:image/png;base64,aA==',
    'javascript:alert(1)', 'https://user:pass@example.com/logo', '//example.com/logo', 'not a URL'
  ])('rejects non-HTTP(S), credentials or invalid URL: %s', async (url) => {
    await expect(fetchRemoteBody(url)).rejects.toThrow()
    expect(lookup).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it.each([
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '127.1', '2130706433', '0x7f000001',
    '0177.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.0.1',
    '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '[::]', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:8.8.8.8]', '[fc00::1]', '[fe80::1]', '[ff02::1]',
    '[64:ff9b::a00:1]', '[2001::1]', '[2001:db8::1]', '[2002:7f00:1::]', '[3fff::1]'
  ])('blocks nonpublic and alternate address forms: %s', async (host) => {
    await expect(fetchRemoteBody(`http://${host}/logo.png`)).rejects.toThrow('public Internet')
    expect(calls).toHaveLength(0)
  })

  it.each(['127.0.0.1', '10.2.3.4', '169.254.169.254', '::1', 'fd00::1', '::ffff:192.168.1.1'])('blocks private DNS answer %s', async (address) => {
    lookupAll.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }])
    await expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('public Internet')
    expect(calls).toHaveLength(0)
  })

  it('rejects an empty or mixed public/private DNS answer set', async () => {
    lookupAll.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { address: '93.184.215.14', family: 4 }, { address: '::1', family: 6 }
    ])
    await expect(fetchRemoteBody('https://empty.example/logo')).rejects.toThrow('public Internet')
    await expect(fetchRemoteBody('https://mixed.example/logo')).rejects.toThrow('public Internet')
    expect(calls).toHaveLength(0)
  })

  it('pins validated DNS for the actual request, preserving hostname/TLS verification', async () => {
    lookupAll.mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const result = await fetchRemoteBody('https://logo.example:8443/icon?size=64#fragment', { Accept: 'image/png' })
    expect(result.buffer).toEqual(pngLogo)
    expect(result.finalUrl).toBe('https://logo.example:8443/icon?size=64')
    expect(lookup).toHaveBeenCalledExactlyOnceWith('logo.example', { all: true, verbatim: true })
    expect(connectedAddresses).toEqual(['93.184.215.14'])
    expect(calls[0].url.hostname).toBe('logo.example')
    expect(calls[0].options).toMatchObject({ agent: false, family: 4, headers: { 'Accept-Encoding': 'identity' } })
    expect(calls[0].options).not.toHaveProperty('rejectUnauthorized', false)
    const callback = vi.fn()
    calls[0].options.lookup!('logo.example', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.215.14', family: 4 }])
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it.each(['http://8.8.8.8/logo', 'https://[2606:4700:4700::1111]/logo'])('permits public literal %s without DNS', async (url) => {
    await expect(fetchRemoteBody(url)).resolves.toMatchObject({ buffer: pngLogo })
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each([301, 302, 303, 307, 308])('follows and revalidates a public %s relative redirect', async (status) => {
    plans.push({ status, headers: { location: '/cdn/logo.png' } }, {})
    const result = await fetchRemoteBody('https://logo.example/start')
    expect(result.finalUrl).toBe('https://logo.example/cdn/logo.png')
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(calls[0].response?.destroyed).toBe(true)
  })

  it.each(['http://127.0.0.1/private', 'http://169.254.169.254/metadata', 'http://[::1]/secret', 'file:///etc/passwd', 'https://user:pass@logo.example/a'])('blocks redirect target %s before a second request', async (location) => {
    plans.push({ status: 302, headers: { location } })
    await expect(fetchRemoteBody('https://logo.example/start')).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('rechecks DNS on even a same-host redirect (rebinding)', async () => {
    lookupAll.mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
    plans.push({ status: 302, headers: { location: '/rebound' } })
    await expect(fetchRemoteBody('https://logo.example/start')).rejects.toThrow('public Internet')
    expect(calls).toHaveLength(1)
  })

  it('rejects cross-host redirect DNS that resolves privately', async () => {
    lookupAll.mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    plans.push({ status: 302, headers: { location: 'http://internal.example/metadata' } })
    await expect(fetchRemoteBody('https://logo.example/start')).rejects.toThrow('public Internet')
    expect(lookup).toHaveBeenLastCalledWith('internal.example', { all: true, verbatim: true })
    expect(calls).toHaveLength(1)
  })

  it('caps redirect loops at five redirects', async () => {
    plans.push(...Array.from({ length: 6 }, () => ({ status: 302, headers: { location: '/loop' } })))
    await expect(fetchRemoteBody('https://logo.example/start')).rejects.toThrow('Too many')
    expect(calls).toHaveLength(6)
  })

  it('rejects oversized Content-Length before buffering', async () => {
    plans.push({ headers: { 'content-length': String(REMOTE_IMAGE_MAX_BYTES + 1) } })
    await expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('too large')
    expect(calls[0].response?.destroyed).toBe(true)
  })

  it('bounds streamed bytes without trusting Content-Length', async () => {
    plans.push({ chunks: [Buffer.alloc(REMOTE_IMAGE_MAX_BYTES), Buffer.from([1])] })
    await expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('exceeds 5 MiB')
    expect(calls[0].response?.destroyed).toBe(true)
  })

  it('accepts exactly the body limit and normalizes Content-Type', async () => {
    plans.push({ headers: { 'content-type': 'IMAGE/PNG; charset=binary' }, chunks: [Buffer.alloc(REMOTE_IMAGE_MAX_BYTES)] })
    const result = await fetchRemoteBody('https://logo.example/logo')
    expect(result.buffer.length).toBe(REMOTE_IMAGE_MAX_BYTES)
    expect(result.contentType).toBe('image/png')
  })

  it('uses an explicit 20 MiB limit without changing the Logo default', async () => {
    const maxBytes = 20 * 1024 * 1024
    plans.push({ headers: { 'content-length': String(maxBytes) }, chunks: [Buffer.alloc(maxBytes)] })
    expect((await fetchRemoteBody('https://images.example/note', {}, { maxBytes })).buffer.length).toBe(maxBytes)
    plans.push({ headers: { 'content-length': String(maxBytes + 1) } })
    await expect(fetchRemoteBody('https://images.example/note', {}, { maxBytes })).rejects.toBeInstanceOf(RemoteImageTooLargeError)
    plans.push({ chunks: [Buffer.alloc(maxBytes), Buffer.from([1])] })
    await expect(fetchRemoteBody('https://images.example/note', {}, { maxBytes })).rejects.toBeInstanceOf(RemoteImageTooLargeError)
    plans.push({ chunks: [Buffer.alloc(REMOTE_IMAGE_MAX_BYTES + 1)] })
    await expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('exceeds 5 MiB')
  })

  it('keeps private-address protection when the byte limit is customized', async () => {
    await expect(fetchRemoteBody('http://127.0.0.1/note', {}, { maxBytes: 20 * 1024 * 1024 })).rejects.toThrow('public Internet')
    expect(calls).toHaveLength(0)
  })

  it.each(['gzip', 'br', 'deflate'])('rejects compressed content %s rather than decompressing an unbounded body', async (encoding) => {
    plans.push({ headers: { 'content-encoding': encoding } })
    await expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('encoded')
  })

  it.each<ResponsePlan>([
    { complete: false }, { headers: { 'content-length': String(pngLogo.length + 1) } },
    { interrupted: true }, { status: 404 }, { status: 302 }, { error: new Error('TLS certificate invalid') }
  ])('rejects incomplete, unsuccessful and failed responses (%j)', async (plan) => {
    plans.push(plan)
    await expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow()
  })

  it('times out stalled DNS and never opens a late connection', async () => {
    vi.useFakeTimers()
    let resolveDns!: (value: Array<{ address: string; family: number }>) => void
    lookupAll.mockReturnValue(new Promise((resolve) => { resolveDns = resolve }))
    const result = expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(20_000)
    await result
    resolveDns([{ address: '93.184.215.14', family: 4 }])
    await Promise.resolve()
    expect(calls).toHaveLength(0)
  })

  it('uses one total deadline across DNS and redirects, not a per-hop timeout', async () => {
    vi.useFakeTimers()
    lookupAll.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve([{ address: '93.184.215.14', family: 4 }]), 12_000)
    }))
    plans.push({ status: 302, headers: { location: '/slow' } }, { stallBody: true })
    const result = expect(fetchRemoteBody('https://logo.example/start')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(12_000)
    expect(calls).toHaveLength(2)
    expect(calls[1].options.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(8_000)
    await result
    expect(calls[1].response?.destroyed).toBe(true)
  })

  it.each<ResponsePlan>([{ stallHeaders: true }, { stallBody: true }])('times out stalled headers or body (%j)', async (plan) => {
    vi.useFakeTimers()
    plans.push(plan)
    const result = expect(fetchRemoteBody('https://logo.example/logo')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(20_000)
    await result
    expect(calls[0].options.signal?.aborted).toBe(true)
  })
})

describe('logo remote-image raster format validation', () => {
  it('applies the default5 and configurable20 MiB limits before image inspection', () => {
    const maxBytes = 20 * 1024 * 1024
    const svg = Buffer.alloc(maxBytes, 32)
    svg.write('<svg/>')
    expect(() => inspectDownloadedImage(svg)).toThrow(RemoteImageTooLargeError)
    expect(inspectDownloadedImage(svg, '', { maxBytes }).contentType).toBe('image/svg+xml')
    expect(() => inspectDownloadedImage(Buffer.concat([svg, Buffer.from(' ')]), '', { maxBytes })).toThrow(RemoteImageTooLargeError)
    expect(() => inspectRasterImage(svg, '', { maxBytes: REMOTE_IMAGE_MAX_BYTES })).toThrow(RemoteImageTooLargeError)
  })

  it.each([
    ['image/png', pngLogo], ['image/jpeg', jpegLogo], ['image/webp', webpLogo], ['image/webp', losslessWebpLogo]
  ] as const)('verifies %s bytes and dimensions', (contentType, buffer) => {
    expect(inspectRasterImage(buffer, contentType)).toEqual({ contentType, width: 1, height: 1 })
  })

  it.each(additionalLogos)('validates $contentType containers and dimensions independently of MIME', ({ buffer, contentType, width, height }) => {
    expect(inspectDownloadedImage(buffer, 'image/svg+xml')).toEqual({ contentType, width, height })
    expect(inspectRasterImage(buffer, contentType)).toEqual({ contentType, width, height })
    for (let end = 0; end < buffer.length; end++) {
      expect(() => inspectDownloadedImage(buffer.subarray(0, end))).toThrow()
    }
  })

  it('supports GIF87a and MIME aliases for BMP and ICO', () => {
    const legacyGif = Buffer.from(gifLogo)
    legacyGif.write('GIF87a')
    expect(inspectRasterImage(legacyGif).contentType).toBe('image/gif')
    expect(inspectRasterImage(icoLogo, 'image/x-icon').contentType).toBe('image/vnd.microsoft.icon')
    expect(inspectRasterImage(bmpLogo, 'image/x-ms-bmp').contentType).toBe('image/bmp')
  })

  it('rejects malformed GIF blocks, ICO offsets, BMP pixels and AVIF box lengths', () => {
    const gif = Buffer.from(gifLogo)
    gif[gif.length - 1] = 255
    const ico = Buffer.from(icoLogo)
    ico.writeUInt32LE(0xffff, 18)
    const bmp = Buffer.from(bmpLogo)
    bmp.writeUInt32LE(bmp.length, 10)
    const avif = Buffer.from(avifLogo)
    avif.writeUInt32BE(7, 32)
    for (const buffer of [gif, ico, bmp, avif]) expect(() => inspectRasterImage(buffer)).toThrow()
  })

  it('rejects unreasonable dimensions in new raster formats', () => {
    const gif = Buffer.from(gifLogo)
    gif.writeUInt16LE(20000, 6)
    const avif = Buffer.from(avifLogo)
    avif.writeUInt32BE(20000, avif.indexOf('ispe') + 8)
    for (const buffer of [gif, avif]) expect(() => inspectRasterImage(buffer)).toThrow()
  })

  it('does not treat HEIC or MP4 ftyp brands as AVIF', () => {
    const heic = Buffer.from(avifLogo)
    heic.write('heic', 8)
    heic.write('heic', 16)
    expect(() => inspectDownloadedImage(heic, 'image/avif')).toThrow()
  })

  it('identifies actual bytes without a MIME or filename and supports octet-stream / image/jpg', () => {
    expect(inspectRasterImage(pngLogo).contentType).toBe('image/png')
    expect(inspectRasterImage(pngLogo, 'application/octet-stream').contentType).toBe('image/png')
    expect(inspectRasterImage(jpegLogo, 'image/jpg').contentType).toBe('image/jpeg')
  })

  it.each(['image/png', 'image/jpeg', 'image/webp', 'text/html'])('rejects HTML even when declared as %s', (type) => {
    expect(() => inspectRasterImage(Buffer.from('<html><script>alert(1)</script></html>'), type)).toThrow()
  })

  it('rejects conflicting MIME and valid raster bytes', () => {
    expect(() => inspectRasterImage(pngLogo, 'image/jpeg')).toThrow()
    expect(() => inspectRasterImage(pngLogo, 'text/html')).toThrow()
  })

  it.each(['<svg/>', '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
    '<svg onload="alert(1)"><script>alert(1)</script><image href="http://127.0.0.1/"/></svg>'])('accepts SVG without inspecting or sanitizing its contents: %s', (svg) => {
    expect(inspectDownloadedImage(Buffer.from(svg))).toEqual({ contentType: 'image/svg+xml' })
    expect(inspectDownloadedImage(Buffer.from(svg), 'image/svg+xml')).toEqual({ contentType: 'image/svg+xml' })
  })

  it('uses actual bytes rather than a claimed SVG MIME and rejects non-images', () => {
    expect(() => inspectDownloadedImage(Buffer.from('not an SVG'), 'image/svg+xml')).toThrow()
    expect(() => inspectDownloadedImage(Buffer.alloc(0), 'image/svg+xml')).toThrow('empty')
    expect(inspectDownloadedImage(pngLogo, 'image/svg+xml')).toMatchObject({ contentType: 'image/png' })
    expect(inspectDownloadedImage(Buffer.from('<svg/>'), 'image/png')).toEqual({ contentType: 'image/svg+xml' })
  })

  it.each([pngLogo, jpegLogo, webpLogo, losslessWebpLogo])('rejects every truncation and appended content for fixture %#', (buffer) => {
    for (let end = 0; end < buffer.length; end++) {
      expect(() => inspectRasterImage(buffer.subarray(0, end))).toThrow()
    }
    expect(() => inspectRasterImage(Buffer.concat([buffer, Buffer.from('<script/>')]))).toThrow()
  })

  it('verifies extended WebP canvas dimensions against actual image dimensions', () => {
    const extendedHeader = Buffer.alloc(18)
    extendedHeader.write('VP8X')
    extendedHeader.writeUInt32LE(10, 4)
    const extended = Buffer.concat([webpLogo.subarray(0, 12), extendedHeader, webpLogo.subarray(12)])
    extended.writeUInt32LE(extended.length - 8, 4)
    expect(inspectRasterImage(extended)).toMatchObject({ width: 1, height: 1 })
    extended.writeUIntLE(10000, 24, 3)
    expect(() => inspectRasterImage(extended)).toThrow()
  })

  it('rejects invalid chunk sizes, missing raster data and oversized dimensions', () => {
    const brokenPng = Buffer.from(pngLogo)
    brokenPng.writeUInt32BE(0xffffffff, 33)
    expect(() => inspectRasterImage(brokenPng)).toThrow()
    const brokenJpeg = Buffer.from(jpegLogo)
    brokenJpeg.writeUInt16BE(0xffff, 4)
    expect(() => inspectRasterImage(brokenJpeg)).toThrow()
    const brokenWebp = Buffer.from(webpLogo)
    brokenWebp.writeUInt32LE(0xffffffff, 16)
    expect(() => inspectRasterImage(brokenWebp)).toThrow()
    const hugePng = Buffer.from(pngLogo)
    hugePng.writeUInt32BE(16385, 16)
    expect(() => inspectRasterImage(hugePng)).toThrow()
    hugePng.writeUInt32BE(8000, 16)
    hugePng.writeUInt32BE(8000, 20)
    expect(() => inspectRasterImage(hugePng)).toThrow()
    expect(() => inspectRasterImage(Buffer.concat([pngLogo.subarray(0, 33), pngLogo.subarray(-12)]))).toThrow()
  })
})
