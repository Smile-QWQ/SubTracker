export type LogoContentType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' |
  'image/gif' | 'image/vnd.microsoft.icon' | 'image/avif' | 'image/bmp'

export const LOGO_MIME_BY_EXTENSION: Record<string, LogoContentType> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.ico': 'image/vnd.microsoft.icon', '.avif': 'image/avif', '.bmp': 'image/bmp'
}

export const LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
  'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/gif': '.gif',
  'image/vnd.microsoft.icon': '.ico', 'image/x-icon': '.ico',
  'image/avif': '.avif', 'image/bmp': '.bmp', 'image/x-ms-bmp': '.bmp', 'image/x-bmp': '.bmp'
}

function isAvif(bytes: Uint8Array) {
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let size = view.getUint32(0)
  let header = 8
  if (size === 1) {
    if (bytes.length < 24 || view.getUint32(8) !== 0) return false
    size = view.getUint32(12)
    header = 16
  } else if (size === 0) size = bytes.length
  if (size < header + 8 || size > bytes.length || (size - header) % 4) return false
  for (let offset = header; offset + 4 <= size; offset += offset === header ? 8 : 4) {
    const brand = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    if (brand === 'avif' || brand === 'avis') return true
  }
  return false
}

export type LogoImportResult =
  | { logoUrl: string; logoSource: string }
  | { requiresSvgConfirmation: true; svgBase64: string; logoSource: string }

/** Detect the file type from bytes, not its name or declared MIME. This does not sanitize SVG. */
export function detectLogoContentType(bytes: Uint8Array): LogoContentType | null {
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => bytes[i] === value)) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && [0x52, 0x49, 0x46, 0x46].every((value, i) => bytes[i] === value) &&
      [0x57, 0x45, 0x42, 0x50].every((value, i) => bytes[i + 8] === value)) return 'image/webp'

  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 &&
      (bytes[4] !== 0 || bytes[5] !== 0)) return 'image/vnd.microsoft.icon'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
  if (isAvif(bytes)) return 'image/avif'

  const encoding = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0)
    ? 'utf-16le'
    : (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c) ? 'utf-16be' : 'utf-8'
  let text = new TextDecoder(encoding).decode(bytes).trimStart()
  // Only inspect the XML prolog and root element; leave all contents untouched.
  while (text.startsWith('<?') || text.startsWith('<!--') || /^<!DOCTYPE\s/i.test(text)) {
    if (text.startsWith('<?') || text.startsWith('<!--')) {
      const closing = text.startsWith('<?') ? '?>' : '-->'
      const end = text.indexOf(closing)
      if (end < 0) return null
      text = text.slice(end + closing.length).trimStart()
    } else {
      const doctype = /^<!DOCTYPE(?:[^>"'\[]|"[^"]*"|'[^']*'|\[[\s\S]*?\])*>/i.exec(text)
      if (!doctype) return null
      text = text.slice(doctype[0].length).trimStart()
    }
  }
  return /^<(?:[\w.-]+:)?svg(?=[\s/>])/i.test(text) ? 'image/svg+xml' : null
}
