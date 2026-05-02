import { unzipSync, strFromU8 } from 'fflate'
import type { SubtrackerBackupAssetLogoDto, SubtrackerBackupInspectResult } from '@/types/api'

type PreparedLogoAsset = {
  path: string
  filename: string
  contentType: string
  base64: string
}

type PreparedSubtrackerBackupPayload = {
  manifest: unknown
  logoAssets: PreparedLogoAsset[]
}

function normalizeZipPath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\/+/, '')
}

function inferContentType(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function basename(value: string) {
  return value.replace(/\\/g, '/').split('/').filter(Boolean).pop() || value
}

function toBase64(bytes: Uint8Array) {
  if (typeof btoa !== 'function') {
    const bufferCtor = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer
    if (!bufferCtor) {
      throw new Error('当前环境无法进行 base64 编码')
    }
    return bufferCtor.from(bytes).toString('base64')
  }

  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function readFileBytes(file: File) {
  return new Uint8Array(
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as ArrayBuffer)
          reader.onerror = () => reject(reader.error ?? new Error('读取备份文件失败'))
          reader.readAsArrayBuffer(file)
        })
  )
}

export async function buildPreparedSubtrackerBackupPayload(file: File): Promise<PreparedSubtrackerBackupPayload> {
  const bytes = await readFileBytes(file)
  if (!bytes.length) {
    throw new Error('备份文件内容为空')
  }

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error('备份 ZIP 无法解析')
  }

  const manifestEntryKey = Object.keys(entries).find((key) => normalizeZipPath(key) === 'manifest.json')
  const manifestEntry = manifestEntryKey ? entries[manifestEntryKey] : undefined
  if (!manifestEntry) {
    throw new Error('备份 ZIP 缺少 manifest.json')
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(strFromU8(manifestEntry))
  } catch {
    throw new Error('备份 manifest 无法解析')
  }

  const rawLogos = (manifest as { assets?: { logos?: SubtrackerBackupAssetLogoDto[] } })?.assets?.logos ?? []
  const logoAssets: PreparedLogoAsset[] = rawLogos.map((asset) => {
    const normalizedPath = normalizeZipPath(asset.path)
    const entry = entries[normalizedPath]
    if (!entry) {
      throw new Error(`备份 ZIP 缺少 Logo 文件：${asset.path}`)
    }
    return {
      path: normalizedPath,
      filename: asset.filename || basename(normalizedPath),
      contentType: asset.contentType || inferContentType(asset.filename || normalizedPath),
      base64: toBase64(entry)
    }
  })

  return {
    manifest,
    logoAssets
  }
}

export type { PreparedSubtrackerBackupPayload, PreparedLogoAsset }
