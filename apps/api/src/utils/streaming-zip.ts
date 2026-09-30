import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { ZipFile as ZipWriter } from 'yazl'
import { openPromise, type Entry, type ZipFile } from 'yauzl'
import { updateZipCrc32 } from './bounded-zip'

export const ZIP_ENTRY_LIMIT = 10000
export const ZIP_MANIFEST_LIMIT = 8 * 1024 * 1024
export const ZIP_ASSET_LIMIT = 20 * 1024 * 1024

export class BackupLimitError extends Error {}

export function byteLimit(maxBytes: number) {
  let bytes = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > maxBytes ? new BackupLimitError('Backup size limit exceeded') : null, chunk)
    }
  })
}

/** Never extract archive-supplied paths onto the filesystem. */
function validateEntry(entry: Entry) {
  const name = entry.fileName
  const segments = name.replace(/\/$/, '').split('/')
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000
  if (!name || name.length > 512 || /[\\:\x00-\x1f\x7f]/.test(name) ||
      segments.some(segment => !segment || segment === '.' || segment === '..') ||
      ![0, 0x8000, 0x4000].includes(mode) || !entry.canDecodeFileData() ||
      !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 ||
      (name.endsWith('/') && (entry.uncompressedSize !== 0 || entry.crc32 !== 0))) {
    throw new Error('Invalid ZIP entry')
  }
}

export class BoundedZipReader {
  private constructor(private zip: ZipFile, readonly entries: Map<string, Entry>, private signal?: AbortSignal) {}

  static async open(filename: string, maxExpandedBytes: number, signal?: AbortSignal) {
    const zip = await openPromise(filename, { autoClose: false, lazyEntries: true, strictFileNames: true, validateEntrySizes: true })
    try {
      if (zip.entryCount > ZIP_ENTRY_LIMIT) throw new BackupLimitError('Too many ZIP entries')
      const entries = new Map<string, Entry>()
      let expanded = 0
      for await (const entry of zip.eachEntry()) {
        signal?.throwIfAborted()
        validateEntry(entry)
        if (entries.has(entry.fileName)) throw new Error('Duplicate ZIP entry')
        expanded += entry.uncompressedSize
        if (!Number.isSafeInteger(expanded) || expanded > maxExpandedBytes) throw new BackupLimitError('Expanded backup size limit exceeded')
        entries.set(entry.fileName, entry)
      }
      return new BoundedZipReader(zip, entries, signal)
    } catch (error) {
      zip.close()
      throw error
    }
  }

  async consume(name: string, maxBytes: number, collect = false): Promise<Buffer> {
    this.signal?.throwIfAborted()
    const entry = this.entries.get(name)
    if (!entry) throw new Error('Missing ZIP entry')
    if (entry.uncompressedSize > maxBytes) throw new BackupLimitError('ZIP entry size limit exceeded')
    const stream = await this.zip.openReadStreamPromise(entry)
    let size = 0
    let crc = 0
    const chunks: Buffer[] = []
    try {
      for await (const chunk of stream) {
        this.signal?.throwIfAborted()
        const bytes = chunk as Buffer
        size += bytes.length
        // Enforce actual output before retaining bytes, independently of ZIP metadata.
        if (size > maxBytes || size > entry.uncompressedSize) throw new BackupLimitError('ZIP entry size limit exceeded')
        crc = updateZipCrc32(bytes, crc)
        if (collect) chunks.push(bytes)
      }
      if (size !== entry.uncompressedSize || crc !== (entry.crc32 >>> 0)) throw new Error('Invalid ZIP entry size or checksum')
      return collect ? Buffer.concat(chunks, size) : Buffer.alloc(0)
    } finally {
      stream.destroy()
    }
  }

  read(name: string, maxBytes: number) {
    return this.consume(name, maxBytes, true)
  }

  close() {
    this.zip.close()
  }
}

export interface ZipSourceFile { path: string; filename: string; size: number }

export async function describeZipSource(filename: string, archivePath: string): Promise<ZipSourceFile> {
  const info = await lstat(filename)
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > ZIP_ASSET_LIMIT) {
    throw new BackupLimitError('Invalid or oversized backup asset')
  }
  return { path: archivePath, filename, size: info.size }
}

/** Lazy file sources keep only the current image and stream buffers in flight. */
export function createZipStream(manifest: Buffer, files: ZipSourceFile[], limits: { maxArchiveBytes: number; maxExpandedBytes: number }) {
  const expanded = files.reduce((total, file) => total + file.size, manifest.length)
  if (manifest.length > ZIP_MANIFEST_LIMIT || files.length + 1 > ZIP_ENTRY_LIMIT || expanded > limits.maxExpandedBytes) {
    throw new BackupLimitError('Backup size limit exceeded')
  }
  const zip = new ZipWriter()
  const output = byteLimit(limits.maxArchiveBytes)
  let active: Readable | undefined
  let stopped = false
  const stop = () => {
    stopped = true
    active?.destroy()
    ;(zip.outputStream as Readable).destroy()
  }
  zip.on('error', error => output.destroy(error))
  zip.outputStream.on('error', error => output.destroy(error))
  output.once('close', stop)
  zip.outputStream.pipe(output)
  zip.addBuffer(manifest, 'manifest.json', { compress: false })
  for (const file of files) {
    zip.addReadStreamLazy(file.path, { size: file.size, compress: false }, callback => {
      if (stopped) return callback(new Error('Backup download closed'), undefined as never)
      active = createReadStream(file.filename)
      active.once('error', error => output.destroy(error))
      callback(null, active)
    })
  }
  zip.end()
  return output
}
