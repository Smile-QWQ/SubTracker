import crypto from 'node:crypto'
import type { Readable } from 'node:stream'
import type { SubtrackerBackupExportFormat } from '@subtracker/shared'
import { BackupBusyError, prepareSubtrackerBackupArchive } from './subtracker-backup.service'

type Archive = Awaited<ReturnType<typeof prepareSubtrackerBackupArchive>>
type Download = { expiresAt: number; authorization: string; archive: Archive }
const tickets = new Map<string, Download>()
let preparing = 0
let active = 0

export function cleanupBackupDownloads() {
  for (const [token, download] of tickets) if (download.expiresAt <= Date.now()) tickets.delete(token)
}

export function clearBackupDownloads() {
  tickets.clear()
}

export async function prepareBackupDownload(authorization: string, includeSubscriptionImages = true, format: SubtrackerBackupExportFormat = 'standard') {
  cleanupBackupDownloads()
  if (tickets.size + preparing + active >= 2) throw new BackupBusyError('Too many backup downloads')
  preparing += 1
  try {
    const archive = await prepareSubtrackerBackupArchive(includeSubscriptionImages, format)
    const token = crypto.randomBytes(24).toString('hex')
    tickets.set(token, { expiresAt: Date.now() + 60_000, authorization, archive })
    return { token }
  } finally {
    preparing -= 1
  }
}

/** A one-use, short-lived capability, not a long-lived bearer token in a URL. */
export function claimBackupDownload(token: string) {
  cleanupBackupDownloads()
  const download = tickets.get(token)
  tickets.delete(token)
  return download
}

export function openBackupDownload(archive: Archive): Readable {
  if (active >= 2) throw new BackupBusyError('Too many backup downloads')
  const stream = archive.openStream()
  active += 1
  stream.once('close', () => { active -= 1 })
  return stream
}
