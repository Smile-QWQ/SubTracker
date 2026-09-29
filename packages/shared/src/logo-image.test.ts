import { describe, expect, it } from 'vitest'
import { detectLogoContentType, LOGO_EXTENSION_BY_MIME, LOGO_MIME_BY_EXTENSION } from './logo-image'

const encode = (text: string) => new TextEncoder().encode(text)

describe('detectLogoContentType', () => {
  it.each([
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    [[0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
    [[0x52, 0x49, 0x46, 0x46, 10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'image/webp']
  ] as const)('recognizes raster signatures without filename or MIME (%#)', (bytes, type) => {
    expect(detectLogoContentType(new Uint8Array(bytes))).toBe(type)
  })

  it.each([
    ['GIF87a', 'image/gif'], ['GIF89a', 'image/gif'], ['BM', 'image/bmp'],
    ['\u0000\u0000\u0001\u0000\u0001\u0000', 'image/vnd.microsoft.icon']
  ])('recognizes the additional signature %s as %s', (signature, type) => {
    expect(detectLogoContentType(encode(signature))).toBe(type)
  })

  it.each(['avif', 'avis'])('recognizes AVIF major or compatible brand %s from a sliced byte view', (brand) => {
    for (const text of [`ftyp${brand}0000mif1`, `ftypmif10000${brand}`]) {
      const bytes = new Uint8Array(25)
      bytes.set(encode(text), 7)
      new DataView(bytes.buffer).setUint32(3, 20)
      expect(detectLogoContentType(bytes.subarray(3, 23))).toBe('image/avif')
    }
  })

  it('supports extended-size AVIF boxes but does not mistake the minor version or HEIC brands for AVIF', () => {
    const bytes = new Uint8Array(24)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 1)
    bytes.set(encode('ftyp'), 4)
    view.setUint32(12, 24)
    bytes.set(encode('avif'), 16)
    expect(detectLogoContentType(bytes)).toBe('image/avif')
    bytes.set(encode('heicavif'), 16)
    expect(detectLogoContentType(bytes)).toBeNull()
    view.setUint32(12, 128)
    expect(detectLogoContentType(bytes)).toBeNull()
  })

  it('keeps extension mappings and canonical MIME types consistent', () => {
    for (const [extension, type] of Object.entries(LOGO_MIME_BY_EXTENSION)) {
      expect(LOGO_EXTENSION_BY_MIME[type]).toBe(extension === '.jpeg' ? '.jpg' : extension)
    }
    expect(LOGO_EXTENSION_BY_MIME['image/x-icon']).toBe('.ico')
    expect(LOGO_EXTENSION_BY_MIME['image/x-ms-bmp']).toBe('.bmp')
  })

  it.each([
    '<svg/>', '\ufeff \n<svg xmlns="http://www.w3.org/2000/svg"/>',
    '<?xml version="1.0"?>\n<!-- image --><svg/>',
    '<!--' + 'large header'.repeat(600) + '--><svg/>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "https://example.com/svg.dtd"><svg/>',
    '<!DOCTYPE svg [<!ENTITY external SYSTEM "https://example.com/entity">]><svg>&external;</svg>',
    '<svg onload="alert(1)"><script>alert(1)</script><image href="http://127.0.0.1/"/></svg>',
    '<svg><unclosed', '<s:svg xmlns:s="http://www.w3.org/2000/svg"/>'
  ])('identifies the SVG root without validating or modifying its contents (%#)', (svg) => {
    const bytes = encode(svg)
    const before = bytes.slice()
    expect(detectLogoContentType(bytes)).toBe('image/svg+xml')
    expect(bytes).toEqual(before)
  })

  it.each(['', '<html><svg/></html>', '<!-- <svg/> --><html/>', 'not SVG', 'text <svg/>', '<svg-icon/>', '<?xml unclosed', '<!-- unclosed', '<!DOCTYPE svg ['])('does not confuse non-SVG content with SVG (%#)', (text) => {
    expect(detectLogoContentType(encode(text))).toBeNull()
  })

  it.each([false, true])('recognizes UTF-16 SVG without decoding it as UTF-8 (big endian: %s)', (bigEndian) => {
    const text = '\ufeff<?xml version="1.0" encoding="UTF-16"?><svg/>'
    const bytes = new Uint8Array(text.length * 2)
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), !bigEndian)
    expect(detectLogoContentType(bytes)).toBe('image/svg+xml')
  })
})
