import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRemoteBody } from '../../src/utils/remote-image'
import { additionalLogos, jpegLogo, pngLogo, webpLogo } from './logo-fixtures'

vi.mock('../../src/db', () => ({ prisma: {} }))
vi.mock('../../src/utils/remote-image', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/utils/remote-image')>(),
  fetchRemoteBody: vi.fn()
}))

describe('logo.service remote import and local persistence', () => {
  let service: typeof import('../../src/services/logo.service')
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'subtracker-logo-test-'))
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    try {
      service = await import('../../src/services/logo.service')
    } finally {
      cwd.mockRestore()
    }
  })

  beforeEach(async () => {
    vi.mocked(fetchRemoteBody).mockReset()
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer: pngLogo, contentType: 'image/png', finalUrl: 'https://cdn.example/final.png' })
    await rm(service.getLogoStorageDir(), { recursive: true, force: true })
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  async function storedBytes(logoUrl: string) {
    expect(logoUrl).toMatch(/^\/static\/logos\/\d+-[a-f0-9]{12}\.(png|jpg|webp|svg|gif|ico|avif|bmp)$/)
    return readFile(path.join(service.getLogoStorageDir(), path.basename(logoUrl)))
  }

  async function expectNoStoredFile() {
    await expect(readdir(service.getLogoStorageDir())).rejects.toMatchObject({ code: 'ENOENT' })
  }

  it.each([
    [pngLogo, 'image/png', '.png'], [jpegLogo, 'image/jpeg', '.jpg'], [webpLogo, 'image/webp', '.webp']
  ] as const)('downloads verified %s data into a readable local file (%s)', async (buffer, contentType, extension) => {
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer, contentType, finalUrl: 'https://cdn.example/logo' })
    const result = await service.importRemoteLogo({ logoUrl: 'https://logo.example/input', source: 'manual-url' })
    expect(result.logoSource).toBe('manual-url')
    expect(result.logoUrl.endsWith(extension)).toBe(true)
    expect(await storedBytes(result.logoUrl)).toEqual(buffer)
    expect(fetchRemoteBody).toHaveBeenCalledWith('https://logo.example/input', expect.objectContaining({ Accept: expect.stringContaining(contentType) }))
  })

  it.each([
    [pngLogo, 'image/png', '.png'], [jpegLogo, 'image/jpeg', '.jpg'], [webpLogo, 'image/webp', '.webp']
  ] as const)('directly stores non-SVG bytes even with an SVG URL and MIME (%s)', async (buffer, contentType, extension) => {
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer, contentType: 'image/svg+xml', finalUrl: 'https://logo.example/image.svg' })
    const result = await service.prepareRemoteLogoImport({ logoUrl: 'https://logo.example/image.svg', source: 'url' })
    expect(result).not.toHaveProperty('requiresSvgConfirmation')
    if (!('logoUrl' in result)) throw new Error('Expected an imported raster image')
    expect(result.logoUrl.endsWith(extension)).toBe(true)
    expect(result.logoSource).toBe('url')
    expect(await storedBytes(result.logoUrl)).toEqual(buffer)
    expect(fetchRemoteBody).toHaveBeenCalledTimes(1)
  })

  it.each(additionalLogos)('stores actual $contentType bytes without SVG consent, including animations', async ({ buffer, contentType, extension }) => {
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer, contentType: 'image/svg+xml', finalUrl: 'https://logo.example/logo.svg' })
    const remote = await service.prepareRemoteLogoImport({ logoUrl: 'https://logo.example/logo.svg' })
    expect(remote).not.toHaveProperty('requiresSvgConfirmation')
    if (!('logoUrl' in remote)) throw new Error('Expected a saved raster logo')
    expect(remote.logoUrl.endsWith(extension)).toBe(true)
    expect(await storedBytes(remote.logoUrl)).toEqual(buffer)
    const uploaded = await service.saveUploadedLogo({ filename: 'wrong.svg', contentType, base64: buffer.toString('base64') })
    expect(uploaded.logoUrl.endsWith(extension)).toBe(true)
    expect(await storedBytes(uploaded.logoUrl)).toEqual(buffer)
    const restored = await service.saveImportedLogoBuffer(buffer, contentType, 'subtracker-zip')
    expect(restored.logoUrl.endsWith(extension)).toBe(true)
    expect(await storedBytes(restored.logoUrl)).toEqual(buffer)
  })

  it.each([
    ['image/x-icon', '.ico'], ['image/vnd.microsoft.icon', '.ico'], ['image/x-ms-bmp', '.bmp'], ['image/x-bmp', '.bmp']
  ])('supports the common MIME alias %s for uploads and ZIP imports', async (contentType, extension) => {
    const logo = additionalLogos.find(item => item.extension === extension)!
    const uploaded = await service.saveUploadedLogo({ filename: `logo${extension}`, contentType, base64: logo.buffer.toString('base64') })
    expect(uploaded.logoUrl.endsWith(extension)).toBe(true)
    expect(await storedBytes(uploaded.logoUrl)).toEqual(logo.buffer)
    const restored = await service.saveImportedLogoBuffer(logo.buffer, contentType)
    expect(restored.logoUrl.endsWith(extension)).toBe(true)
  })

  it('returns actual SVG as inert data for consent without storing or re-downloading it', async () => {
    const svg = Buffer.from('<svg onload="alert(1)"><script>alert(1)</script></svg>')
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer: svg, contentType: 'image/png', finalUrl: 'https://logo.example/image.png' })
    const result = await service.prepareRemoteLogoImport({ logoUrl: 'https://logo.example/image.png', source: 'url' })
    expect(result).toEqual({ requiresSvgConfirmation: true, svgBase64: svg.toString('base64'), logoSource: 'url' })
    await expectNoStoredFile()
    if (!('svgBase64' in result)) throw new Error('Expected pending SVG data')
    const saved = await service.saveUploadedLogo({ filename: 'logo.svg', contentType: 'image/svg+xml', base64: result.svgBase64 })
    expect(await storedBytes(saved.logoUrl)).toEqual(svg)
    expect(fetchRemoteBody).toHaveBeenCalledTimes(1)
  })

  it('normalizes a remote URL to local storage, never the original or redirect URL', async () => {
    const result = await service.normalizeLogoForStorage({ logoUrl: 'https://logo.example/input' })
    expect(result.logoSource).toBe('remote')
    expect(result.logoFetchedAt).toBeInstanceOf(Date)
    expect(await storedBytes(result.logoUrl!)).toEqual(pngLogo)
    expect(result.logoUrl).not.toContain('example')
  })

  it('selects the extension from verified bytes instead of URL suffix', async () => {
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer: pngLogo, contentType: '', finalUrl: 'https://logo.example/not-an-svg.svg' })
    const result = await service.importRemoteLogo({ logoUrl: 'https://logo.example/not-an-svg.svg' })
    expect(result.logoUrl.endsWith('.png')).toBe(true)
    expect(await storedBytes(result.logoUrl)).toEqual(pngLogo)
  })

  it('keeps an existing local library URL without downloading', async () => {
    const result = await service.normalizeLogoForStorage({ logoUrl: '/static/logos/123-abc.png', logoSource: 'library' })
    expect(result).toMatchObject({ logoUrl: '/static/logos/123-abc.png', logoSource: 'library' })
    expect(result.logoFetchedAt).toBeInstanceOf(Date)
    expect(fetchRemoteBody).not.toHaveBeenCalled()
  })

  it('clears missing logo data', async () => {
    await expect(service.normalizeLogoForStorage({ logoUrl: null })).resolves.toEqual({ logoUrl: null, logoSource: null, logoFetchedAt: null })
    expect(fetchRemoteBody).not.toHaveBeenCalled()
  })

  it.each([
    'javascript:alert(1)', 'file:///etc/passwd', 'data:image/png;base64,aA==', '//remote.example/logo.png',
    '/static/logos/../private', '/static/logos/%2e%2e/private', '/static/logos/nested/logo.png',
    '/static/logos/logo.png?x=1', '/static/logos/logo.png#hash', '/static/logos/..', '/other/logo.png'
  ])('rejects invalid/nonlocal normalization input: %s', async (logoUrl) => {
    await expect(service.normalizeLogoForStorage({ logoUrl }, 'en-US')).rejects.toThrow('remote logo')
    expect(fetchRemoteBody).not.toHaveBeenCalled()
    await expectNoStoredFile()
  })

  it('returns the existing localized error on network failure and writes nothing', async () => {
    vi.mocked(fetchRemoteBody).mockRejectedValue(new Error('private DNS answer'))
    await expect(service.importRemoteLogo({ logoUrl: 'https://private.example/logo' }, 'en-US')).rejects.toThrow('Failed to download the remote logo')
    await expectNoStoredFile()
  })

  it.each([Buffer.alloc(0), Buffer.from('<html>not a logo</html>'), pngLogo.subarray(0, 24)])('never persists unverified image bytes (%#)', async (buffer) => {
    vi.mocked(fetchRemoteBody).mockResolvedValue({ buffer, contentType: 'image/png', finalUrl: 'https://logo.example/logo.png' })
    await expect(service.importRemoteLogo({ logoUrl: 'https://logo.example/logo.png' })).rejects.toThrow()
    await expectNoStoredFile()
  })

  it.each(['image/svg+xml', 'application/octet-stream'])('stores remote SVG unchanged, including scripts and external references (%s)', async (contentType) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><image href="https://example.com/image.png"/></svg>')
    vi.mocked(fetchRemoteBody).mockResolvedValue({
      buffer: svg, contentType, finalUrl: 'https://logo.example/download'
    })
    const result = await service.importRemoteLogo({ logoUrl: 'https://logo.example/download' })
    expect(result.logoUrl.endsWith('.svg')).toBe(true)
    expect(await storedBytes(result.logoUrl)).toEqual(svg)
  })

  it('retains the existing explicit SVG upload behavior (outside remote import)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const result = await service.saveUploadedLogo({ filename: 'logo.svg', contentType: 'image/svg+xml', base64: svg.toString('base64') })
    expect(result.logoUrl.endsWith('.svg')).toBe(true)
    expect(await readFile(path.join(service.getLogoStorageDir(), path.basename(result.logoUrl)))).toEqual(svg)
    expect(fetchRemoteBody).not.toHaveBeenCalled()
  })
})
