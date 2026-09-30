import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buffer as collectBuffer } from 'node:stream/consumers'
import AdmZip from 'adm-zip'
import { BoundedZipReader, createZipStream, describeZipSource, ZIP_MANIFEST_LIMIT } from '../../src/utils/streaming-zip'

let root: string
let reader: BoundedZipReader | undefined
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'streaming-zip-')) })
afterEach(async () => { reader?.close(); reader = undefined; await rm(root, { recursive: true, force: true }) })

async function open(bytes: Buffer, limit = 1024 * 1024) {
  const filename = path.join(root, 'archive.zip')
  await writeFile(filename, bytes)
  reader = await BoundedZipReader.open(filename, limit)
  return reader
}
function archive(name = 'data.txt', bytes = Buffer.from('original data')) {
  const zip = new AdmZip()
  zip.addFile(name, bytes)
  return zip.toBuffer()
}
function header(bytes: Buffer) { return bytes.indexOf(Buffer.from('504b0102', 'hex')) }

 describe('bounded streaming ZIP', () => {
  it('streams stored files and preserves their original bytes', async () => {
    const bytes = Buffer.alloc(256 * 1024, 97)
    const filename = path.join(root, 'original.png')
    await writeFile(filename, bytes)
    const file = await describeZipSource(filename, 'images/original.png')
    const stream = createZipStream(Buffer.from('{}'), [file], { maxArchiveBytes: 1024 * 1024, maxExpandedBytes: 1024 * 1024 })
    const zip = new AdmZip(await collectBuffer(stream))
    expect(zip.getEntries().map(item => item.entryName)).toEqual(['manifest.json', 'images/original.png'])
    expect(zip.getEntries()[1].getData().equals(bytes)).toBe(true)
    expect(zip.getEntries()[1].header.method).toBe(0)
  })

  it('rejects actual download bytes above the archive cap', async () => {
    const stream = createZipStream(Buffer.from('{}'), [], { maxArchiveBytes: 8, maxExpandedBytes: 1024 })
    await expect(collectBuffer(stream)).rejects.toThrow('limit')
  })

  it('rejects expanded totals and oversized metadata before opening sources', () => {
    expect(() => createZipStream(Buffer.alloc(ZIP_MANIFEST_LIMIT + 1), [], { maxArchiveBytes: Infinity, maxExpandedBytes: Infinity })).toThrow('limit')
    expect(() => createZipStream(Buffer.from('{}'), [{ filename: 'missing', path: 'x', size: 10 }], { maxArchiveBytes: 1024, maxExpandedBytes: 8 })).toThrow('limit')
  })

  it('surfaces a missing source as a failed stream rather than a successful truncated download', async () => {
    const stream = createZipStream(Buffer.from('{}'), [{ path: 'missing.png', filename: path.join(root, 'missing.png'), size: 10 }], { maxArchiveBytes: 1024, maxExpandedBytes: 1024 })
    await expect(collectBuffer(stream)).rejects.toThrow()
  })

  it('rejects declared expanded totals before decompression', async () => {
    await expect(open(archive('x', Buffer.alloc(1024)), 512)).rejects.toThrow('limit')
  })

  it('bounds forged deflate output even when the declared size is tiny', async () => {
    const bytes = archive('x', Buffer.alloc(512 * 1024))
    bytes.writeUInt32LE(1, header(bytes) + 24)
    const zip = await open(bytes, 1024)
    await expect(zip.read('x', 1024)).rejects.toThrow()
  })

  it('verifies CRCs for collected and uncollected data', async () => {
    const bytes = archive()
    bytes.writeUInt32LE((bytes.readUInt32LE(header(bytes) + 16) ^ 1) >>> 0, header(bytes) + 16)
    const zip = await open(bytes)
    await expect(zip.consume('data.txt', 1024)).rejects.toThrow('checksum')
    await expect(zip.read('data.txt', 1024)).rejects.toThrow('checksum')
  })

  it('reads legacy compressed ZIPs and harmless directory entries', async () => {
    const zip = new AdmZip()
    zip.addFile('dir/', Buffer.alloc(0))
    zip.addFile('dir/file', Buffer.from('text'))
    const input = await open(zip.toBuffer())
    await expect(input.read('dir/file', 20)).resolves.toEqual(Buffer.from('text'))
    await expect(input.consume('dir/', 0)).resolves.toEqual(Buffer.alloc(0))
  })

  it.each(['../x', '/tmp/x', 'C:/xx', 'a\\bxx'])('rejects unsafe ZIP paths %s', async name => {
    const bytes = archive('valid')
    // Mutate central-directory names directly: ZIP builders sanitize unsafe input themselves.
    Buffer.from(name.padEnd(5, 'x')).copy(bytes, header(bytes) + 46, 0, 5)
    await expect(open(bytes)).rejects.toThrow()
  })

  it.each([0xa000, 0x1000, 0x6000])('rejects special Unix file type %s', async mode => {
    const bytes = archive()
    bytes.writeUInt32LE((mode << 16) >>> 0, header(bytes) + 38)
    await expect(open(bytes)).rejects.toThrow()
  })

  it('rejects encrypted entries', async () => {
    const bytes = archive()
    bytes.writeUInt16LE(bytes.readUInt16LE(header(bytes) + 8) | 1, header(bytes) + 8)
    await expect(open(bytes)).rejects.toThrow()
  })

  it('rejects duplicate central-directory paths', async () => {
    const zip = new AdmZip()
    zip.addFile('first', Buffer.from('one'))
    zip.addFile('other', Buffer.from('two'))
    const bytes = zip.toBuffer()
    const second = bytes.indexOf(Buffer.from('504b0102', 'hex'), header(bytes) + 4)
    Buffer.from('first').copy(bytes, second + 46)
    await expect(open(bytes)).rejects.toThrow('Duplicate')
  })

  it('honors cancellation while walking entries', async () => {
    const filename = path.join(root, 'abort.zip')
    await writeFile(filename, archive())
    const controller = new AbortController()
    controller.abort()
    await expect(BoundedZipReader.open(filename, 1024, controller.signal)).rejects.toThrow()
  })
})
