import { inflateRawSync } from 'node:zlib'
import type { IZipEntry } from 'adm-zip'

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})

export function updateZipCrc32(buffer: Buffer, previous = 0) {
  let crc = (previous ^ 0xffffffff) >>> 0
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

/** Enforce the output limit while inflating, even if a ZIP forges its declared size. */
export function readBoundedZipEntry(entry: IZipEntry, maxBytes: number): Buffer {
  const { size, method, flags, crc } = entry.header
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes || (flags & 1) || ![0, 8].includes(method)) {
    throw new Error('Invalid or oversized ZIP entry')
  }
  const compressed = entry.getCompressedData()
  const output = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) })
  if (output.length !== size || updateZipCrc32(output) !== (crc >>> 0)) throw new Error('Invalid ZIP entry size or checksum')
  return output
}
