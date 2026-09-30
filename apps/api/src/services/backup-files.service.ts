import { mkdir, mkdtemp, open, readdir, rm, lstat } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { DEFAULT_SUBTRACKER_BACKUP_MAX_BYTES } from '@subtracker/shared'
import { apiRootDir } from '../config'
import { BackupLimitError } from '../utils/streaming-zip'

export const BACKUP_PREVIEW_TTL_MS = 15 * 60 * 1000
const liveDirectories = new Set<string>()

function readMiB(name: string, fallback: number) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(value * 1024 * 1024)) {
    throw new Error(`${name} must be a positive integer in MiB`)
  }
  return value * 1024 * 1024
}

export function getBackupLimits() {
  const maxArchiveBytes = readMiB('BACKUP_MAX_ARCHIVE_MIB', DEFAULT_SUBTRACKER_BACKUP_MAX_BYTES)
  return {
    maxArchiveBytes,
    maxExpandedBytes: readMiB('BACKUP_MAX_EXPANDED_MIB', DEFAULT_SUBTRACKER_BACKUP_MAX_BYTES),
    maxTempBytes: readMiB('BACKUP_TEMP_MAX_MIB', maxArchiveBytes * 2)
  }
}

export function getBackupTempDir() {
  return process.env.BACKUP_TEMP_DIR
    ? path.resolve(process.env.BACKUP_TEMP_DIR)
    : path.join(apiRootDir, 'storage', 'backup-temp')
}

async function ownedDirectories() {
  const root = getBackupTempDir()
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  return entries.filter(entry => entry.isDirectory() && /^backup-[a-zA-Z0-9]{6}$/.test(entry.name)).map(entry => path.join(root, entry.name))
}

/** Sweep only our expired private directories, never a configured directory wholesale. */
export async function cleanupAbandonedBackupFiles() {
  for (const directory of await ownedDirectories()) {
    if (liveDirectories.has(directory)) continue
    const info = await lstat(directory).catch(() => null)
    if (info && Date.now() - info.mtimeMs > BACKUP_PREVIEW_TTL_MS) await rm(directory, { recursive: true, force: true })
  }
}

export interface BackupUpload { directory: string; filename: string; size: number }

export async function disposeBackupUpload(upload: BackupUpload) {
  try {
    await rm(upload.directory, { recursive: true, force: true })
  } finally {
    liveDirectories.delete(upload.directory)
  }
}

/** A sequential file write supplies backpressure without buffering the incoming ZIP. */
export async function saveBackupUpload(source: Readable): Promise<BackupUpload> {
  const limits = getBackupLimits()
  await cleanupAbandonedBackupFiles()
  let used = 0
  for (const directory of await ownedDirectories()) {
    const info = await lstat(path.join(directory, 'archive.zip')).catch(() => null)
    used += info?.size ?? 0
  }
  const available = Math.min(limits.maxArchiveBytes, limits.maxTempBytes - used)
  if (available <= 0) throw new BackupLimitError('Backup temporary storage limit exceeded')
  await mkdir(getBackupTempDir(), { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(path.join(getBackupTempDir(), 'backup-'))
  const upload = { directory, filename: path.join(directory, 'archive.zip'), size: 0 }
  liveDirectories.add(directory)
  const idleTimer = setTimeout(() => source.destroy(new Error('Backup upload timed out')), 5 * 60 * 1000)
  idleTimer.unref()
  try {
    const file = await open(upload.filename, 'wx', 0o600)
    try {
      // Do not destroy the HTTP socket on a size failure: the route must first send 413.
      for await (const chunk of source.iterator({ destroyOnReturn: false })) {
        idleTimer.refresh()
        const bytes = chunk as Buffer
        upload.size += bytes.length
        if (upload.size > available) throw new BackupLimitError('Backup size limit exceeded')
        await file.writeFile(bytes)
      }
      if (upload.size === 0) throw new Error('Empty backup')
    } finally {
      await file.close()
    }
    return upload
  } catch (error) {
    await disposeBackupUpload(upload)
    throw error
  } finally {
    clearTimeout(idleTimer)
  }
}
