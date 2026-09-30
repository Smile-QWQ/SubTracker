import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { readBoundedZipEntry } from '../../src/utils/bounded-zip'

function entryFor(data: Buffer) {
  const zip = new AdmZip()
  zip.addFile('image.png', data)
  return new AdmZip(zip.toBuffer()).getEntries()[0]
}

describe('bounded backup ZIP decompression', () => {
  it('reads valid compressed data and empty entries', () => {
    const data = Buffer.from('receipt data')
    expect(readBoundedZipEntry(entryFor(data), data.length)).toEqual(data)
    expect(readBoundedZipEntry(entryFor(Buffer.alloc(0)), 1)).toEqual(Buffer.alloc(0))
  })

  it('rejects declared sizes above the limit', () => {
    expect(() => readBoundedZipEntry(entryFor(Buffer.alloc(1024)), 10)).toThrow()
  })

  it('bounds actual inflated output even when the declared size is forged', () => {
    const entry = entryFor(Buffer.alloc(1024 * 1024))
    entry.header.size = 16
    expect(() => readBoundedZipEntry(entry, 20)).toThrow()
  })

  it('rejects wrong CRC, encrypted entries and unknown compression methods', () => {
    const crcEntry = entryFor(Buffer.from('receipt'))
    crcEntry.header.crc ^= 1
    expect(() => readBoundedZipEntry(crcEntry, 100)).toThrow(/checksum/)
    const encrypted = entryFor(Buffer.from('receipt'))
    encrypted.header.flags |= 1
    expect(() => readBoundedZipEntry(encrypted, 100)).toThrow()
    const unsupported = entryFor(Buffer.from('receipt'))
    unsupported.header.method = 99
    expect(() => readBoundedZipEntry(unsupported, 100)).toThrow()
  })
})
