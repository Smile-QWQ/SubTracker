import { imageSize } from 'image-size'
import type { LogoContentType } from '@subtracker/shared'

function validGif(buffer: Buffer) {
  if (buffer.length < 14) return false
  const width = buffer.readUInt16LE(6)
  const height = buffer.readUInt16LE(8)
  let offset = 13 + (buffer[10] & 0x80 ? 3 * 2 ** ((buffer[10] & 7) + 1) : 0)
  let frames = 0
  while (offset < buffer.length) {
    const marker = buffer[offset++]
    if (marker === 0x3b) return frames > 0 && offset === buffer.length
    if (marker === 0x21) {
      if (offset >= buffer.length) return false
      offset++ // Extension label; the payload is a sequence of bounded sub-blocks.
    } else if (marker === 0x2c) {
      if (offset + 9 > buffer.length) return false
      const frameWidth = buffer.readUInt16LE(offset + 4)
      const frameHeight = buffer.readUInt16LE(offset + 6)
      if (!frameWidth || !frameHeight || buffer.readUInt16LE(offset) + frameWidth > width ||
          buffer.readUInt16LE(offset + 2) + frameHeight > height) return false
      const packed = buffer[offset + 8]
      offset += 9 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
      if (offset >= buffer.length || buffer[offset] < 2 || buffer[offset] > 8) return false
      offset++ // LZW minimum code size.
      if (!buffer[offset]) return false
      frames++
    } else return false
    for (;;) {
      if (offset >= buffer.length) return false
      const length = buffer[offset++]
      if (!length) break
      offset += length
      if (offset > buffer.length) return false
    }
  }
  return false
}

function validBmp(buffer: Buffer) {
  if (buffer.length < 26 || buffer.readUInt32LE(2) !== buffer.length) return false
  const header = buffer.readUInt32LE(14)
  const offset = buffer.readUInt32LE(10)
  if ((header !== 12 && header < 40) || 14 + header > buffer.length || offset < 14 + header || offset >= buffer.length) return false
  const core = header === 12
  const width = core ? buffer.readUInt16LE(18) : buffer.readInt32LE(18)
  const height = Math.abs(core ? buffer.readUInt16LE(20) : buffer.readInt32LE(22))
  const planes = buffer.readUInt16LE(core ? 22 : 26)
  const bits = buffer.readUInt16LE(core ? 24 : 28)
  const compression = core ? 0 : buffer.readUInt32LE(30)
  if (width <= 0 || !height || planes !== 1 || ![1, 2, 4, 8, 16, 24, 32].includes(bits) || compression > 6) return false
  if ([0, 3, 6].includes(compression)) {
    return offset + Math.ceil(width * bits / 32) * 4 * height <= buffer.length
  }
  const imageSize = buffer.readUInt32LE(34)
  return imageSize > 0 && offset + imageSize <= buffer.length
}

function validIco(buffer: Buffer) {
  if (buffer.length < 22) return false
  const count = buffer.readUInt16LE(4)
  const tableEnd = 6 + 16 * count
  if (!count || tableEnd > buffer.length) return false
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16
    const size = buffer.readUInt32LE(entry + 8)
    const offset = buffer.readUInt32LE(entry + 12)
    if (size < 12 || offset < tableEnd || offset + size > buffer.length) return false
    const png = buffer.subarray(offset, offset + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const dib = buffer.readUInt32LE(offset)
    if (!png && (dib < 12 || dib > size)) return false
  }
  return true
}

function validAvif(buffer: Buffer) {
  let hasMetadata = false
  let hasData = false
  let boxes = 0
  const containers = new Set(['meta', 'iprp', 'ipco', 'moov', 'trak', 'mdia', 'minf', 'stbl'])
  function visit(start: number, end: number, depth: number): boolean {
    if (depth > 16 || start > end) return false
    for (let offset = start; offset < end;) {
      if (++boxes > 10_000 || offset + 8 > end) return false
      let size = buffer.readUInt32BE(offset)
      const type = buffer.toString('ascii', offset + 4, offset + 8)
      let header = 8
      if (size === 1) {
        if (offset + 16 > end || buffer.readUInt32BE(offset + 8) !== 0) return false
        size = buffer.readUInt32BE(offset + 12)
        header = 16
      } else if (size === 0) size = end - offset
      if (size < header || offset + size > end) return false
      if (type === 'meta' || type === 'moov') hasMetadata = true
      if ((type === 'mdat' || type === 'idat') && size > header) hasData = true
      if (containers.has(type) && !visit(offset + header + (type === 'meta' ? 4 : 0), offset + size, depth + 1)) return false
      offset += size
    }
    return true
  }
  return visit(0, buffer.length, 0) && hasMetadata && hasData
}

/** Check container bounds before reading dimensions. Never decode or transcode image pixels. */
export function inspectAdditionalRaster(buffer: Buffer, contentType: LogoContentType | null) {
  const validators = {
    'image/gif': validGif,
    'image/bmp': validBmp,
    'image/vnd.microsoft.icon': validIco,
    'image/avif': validAvif
  }
  if (!contentType || !(contentType in validators)) return null
  try {
    if (!validators[contentType as keyof typeof validators](buffer)) return null
    const { width, height } = imageSize(buffer)
    return { contentType, width, height }
  } catch {
    return null
  }
}
