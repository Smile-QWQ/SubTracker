import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apiRootDir } from '../../src/config'
import { cleanupAbandonedBackupFiles, disposeBackupUpload, getBackupLimits, getBackupTempDir, saveBackupUpload } from '../../src/services/backup-files.service'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'backup-files-'))
  vi.stubEnv('BACKUP_TEMP_DIR', root)
  vi.stubEnv('BACKUP_MAX_ARCHIVE_MIB', '')
  vi.stubEnv('BACKUP_MAX_EXPANDED_MIB', '')
  vi.stubEnv('BACKUP_TEMP_MAX_MIB', '')
})
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })

describe('backup temporary storage and configurable limits', () => {
  it('defaults to separate 2 GiB limits and a 4 GiB temporary quota', () => {
    expect(getBackupLimits()).toEqual({ maxArchiveBytes: 2 * 1024 ** 3, maxExpandedBytes: 2 * 1024 ** 3, maxTempBytes: 4 * 1024 ** 3 })
  })
  it('supports independent archive, expanded and temp limits', () => {
    vi.stubEnv('BACKUP_MAX_ARCHIVE_MIB', '3072')
    vi.stubEnv('BACKUP_MAX_EXPANDED_MIB', '4096')
    vi.stubEnv('BACKUP_TEMP_MAX_MIB', '6144')
    expect(getBackupLimits()).toEqual({ maxArchiveBytes: 3 * 1024 ** 3, maxExpandedBytes: 4 * 1024 ** 3, maxTempBytes: 6 * 1024 ** 3 })
  })
  it.each(['0', '-1', 'bad', '1.2', 'Infinity', '9007199254740991'])('fails closed for invalid configured MiB %s', value => {
    vi.stubEnv('BACKUP_MAX_ARCHIVE_MIB', value)
    expect(() => getBackupLimits()).toThrow('BACKUP_MAX_ARCHIVE_MIB')
  })
  it('uses a stable default directory independent of cwd', () => {
    vi.stubEnv('BACKUP_TEMP_DIR', '')
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    expect(getBackupTempDir()).toBe(path.join(apiRootDir, 'storage', 'backup-temp'))
  })
  it('writes sequential chunks and removes them when disposed', async () => {
    const upload = await saveBackupUpload(Readable.from([Buffer.from('a'), Buffer.from('b')]))
    expect(upload.size).toBe(2)
    await expect(access(upload.filename)).resolves.toBeUndefined()
    await disposeBackupUpload(upload)
    expect(await readdir(root)).toEqual([])
  })
  it('cleans partial files after an oversized upload, without destroying the HTTP input', async () => {
    vi.stubEnv('BACKUP_MAX_ARCHIVE_MIB', '1')
    let remaining = 2
    const source = new Readable({ read() {
      if (remaining === 2) this.push(Buffer.alloc(1024 * 1024))
      if (remaining === 1) this.push(Buffer.from('extra'))
      remaining -= 1
    } })
    await expect(saveBackupUpload(source)).rejects.toThrow('limit')
    expect(source.destroyed).toBe(false)
    source.destroy()
    expect(await readdir(root)).toEqual([])
  })
  it('cleans partial files after a source error', async () => {
    const source = new Readable({ read() { this.push(Buffer.from('partial')); this.destroy(new Error('disconnected')) } })
    await expect(saveBackupUpload(source)).rejects.toThrow('disconnected')
    expect(await readdir(root)).toEqual([])
  })
  it('counts existing pending files toward the temporary quota', async () => {
    vi.stubEnv('BACKUP_TEMP_MAX_MIB', '1')
    const upload = await saveBackupUpload(Readable.from(Buffer.alloc(1024 * 1024)))
    await expect(saveBackupUpload(Readable.from(Buffer.from('x')))).rejects.toThrow('temporary')
    await disposeBackupUpload(upload)
  })
  it('cleans only expired inactive owned directories', async () => {
    const old = path.join(root, 'backup-Abc123')
    const unrelated = path.join(root, 'do-not-remove')
    await mkdir(old)
    await writeFile(path.join(old, 'archive.zip'), 'old')
    await mkdir(unrelated)
    const live = await saveBackupUpload(Readable.from(Buffer.from('live')))
    const past = new Date(Date.now() - 60 * 60 * 1000)
    for (const directory of [old, unrelated, live.directory]) await utimes(directory, past, past)
    await cleanupAbandonedBackupFiles()
    await expect(access(old)).rejects.toThrow()
    await expect(access(unrelated)).resolves.toBeUndefined()
    await expect(access(live.filename)).resolves.toBeUndefined()
    await disposeBackupUpload(live)
  })
})
