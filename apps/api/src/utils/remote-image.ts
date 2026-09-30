import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import { detectLogoContentType, LOGO_EXTENSION_BY_MIME, LOGO_MIME_BY_EXTENSION } from '@subtracker/shared'
import { inspectAdditionalRaster } from './additional-raster-image'

export const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

export type ImageSizeOptions = { maxBytes?: number }

export class RemoteImageTooLargeError extends Error {}

function getMaxBytes(options: ImageSizeOptions) {
  const maxBytes = options.maxBytes ?? REMOTE_IMAGE_MAX_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid image byte limit')
  return maxBytes
}

const blockedV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3]
] as const) blockedV4.addSubnet(address, prefix, 'ipv4')

const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const blockedV6 = new BlockList()
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
] as const) blockedV6.addSubnet(address, prefix, 'ipv6')

function isPublicAddress(address: string) {
  if (isIP(address) === 4) return !blockedV4.check(address, 'ipv4')
  // Only global unicast; this also rejects mapped IPv4, NAT64, local and multicast ranges.
  return isIP(address) === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6')
}

function parseRemoteUrl(input: string) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Logo URL must use HTTP(S) without credentials')
  }
  url.hash = ''
  return url
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

type RemoteBody = { buffer: Buffer; contentType: string; finalUrl: string }
type HopResult = { location: string } | RemoteBody

async function requestHop(url: URL, headers: Record<string, string>, signal: AbortSignal, maxBytes: number): Promise<HopResult> {
  signal.throwIfAborted()
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const literalFamily = isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await abortable(lookup(hostname, { all: true, verbatim: true }), signal)
  signal.throwIfAborted()
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Logo URL must resolve only to public Internet addresses')
  }
  const pinned = addresses[0]

  return new Promise((resolve, reject) => {
    // Node's per-request lookup pins the validated IP without changing Host, TLS SNI or
    // certificate verification. No pooled socket or second DNS lookup may bypass it.
    // https://nodejs.org/api/http.html#httprequesturl-options-callback
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET',
      agent: false,
      signal,
      maxHeaderSize: 16 * 1024,
      family: pinned.family,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [pinned])
        else callback(null, pinned.address, pinned.family)
      },
      headers: { ...headers, 'Accept-Encoding': 'identity' }
    }, (response) => {
      response.on('error', reject)
      response.on('aborted', () => reject(new Error('Logo response was interrupted')))
      const status = response.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        resolve({ location: response.headers.location })
        response.destroy()
        return
      }
      if (status < 200 || status >= 300) {
        reject(new Error(`Logo request failed: ${status}`))
        response.destroy()
        return
      }
      const encoding = response.headers['content-encoding']
      const length = response.headers['content-length']
      if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
        reject(new RemoteImageTooLargeError('Logo response is too large'))
        response.destroy()
        return
      }
      if ((encoding && encoding.toLowerCase() !== 'identity') || (length && !/^\d+$/.test(length))) {
        reject(new Error('Logo response is encoded or has an invalid length'))
        response.destroy()
        return
      }

      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) {
          reject(new RemoteImageTooLargeError(`Logo response exceeds ${maxBytes / 1024 / 1024} MiB`))
          response.destroy()
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (!response.complete || (length && size !== Number(length))) {
          reject(new Error('Logo response was truncated'))
          return
        }
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase(),
          finalUrl: url.toString()
        })
      })
    })
    request.on('error', reject)
    request.end()
  })
}

/** Bounded public-Internet GET, including DNS, every redirect, headers and streamed body. */
export async function fetchRemoteBody(input: string, headers: Record<string, string> = {}, options: ImageSizeOptions = {}): Promise<RemoteBody> {
  const maxBytes = getMaxBytes(options)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Logo request timed out')), REQUEST_TIMEOUT_MS)
  try {
    let url = parseRemoteUrl(input)
    for (let redirects = 0; ; redirects++) {
      const result = await requestHop(url, headers, controller.signal, maxBytes)
      if (!('location' in result)) return result
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many Logo redirects')
      url = parseRemoteUrl(new URL(result.location, url).toString())
    }
  } finally {
    clearTimeout(timer)
  }
}

type RasterMeta = { contentType: string; width: number; height: number }
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function inspectPng(buffer: Buffer): RasterMeta | null {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(pngSignature)) return null
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
  if (!depths[buffer[25]]?.includes(buffer[24]) || buffer[26] || buffer[27] || buffer[28] > 1) return null
  let hasData = false
  for (let offset = 33; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const end = offset + 12 + length
    if (end > buffer.length || type === 'IHDR') return null
    if (type === 'IDAT' && length > 0) hasData = true
    if (type === 'IEND') {
      return length === 0 && end === buffer.length && hasData ? { contentType: 'image/png', width, height } : null
    }
    offset = end
  }
  return null
}

function inspectJpeg(buffer: Buffer): RasterMeta | null {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null
  let dimensions: RasterMeta | null = null
  let hasScan = false
  let inScan = false
  let offset = 2
  while (offset < buffer.length) {
    if (inScan && buffer[offset] !== 0xff) { offset++; continue }
    if (buffer[offset++] !== 0xff) return null
    while (buffer[offset] === 0xff) offset++
    if (offset >= buffer.length) return null
    const marker = buffer[offset++]
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue
    inScan = false
    if (marker === 0xd9) return hasScan && offset === buffer.length ? dimensions : null
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > buffer.length) return null
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) return null
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || length !== 8 + 3 * buffer[offset + 7]) return null
      dimensions = { contentType: 'image/jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) }
    }
    if (marker === 0xda) {
      if (!dimensions || length < 6 || length !== 6 + 2 * buffer[offset + 2]) return null
      hasScan = true
      inScan = true
    }
    offset += length
  }
  return null
}

function inspectWebp(buffer: Buffer): RasterMeta | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WEBP' || buffer.readUInt32LE(4) + 8 !== buffer.length) return null
  let dimensions: RasterMeta | null = null
  let hasData = false
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4)
    const length = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + length + (length % 2)
    if (end > buffer.length) return null
    if (type === 'VP8X') {
      if (offset !== 12 || length !== 10) return null
      dimensions = { contentType: 'image/webp', width: 1 + buffer.readUIntLE(start + 4, 3), height: 1 + buffer.readUIntLE(start + 7, 3) }
    } else if (type === 'VP8 ') {
      if (length < 10 || (buffer[start] & 1) || !buffer.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) return null
      const width = buffer.readUInt16LE(start + 6) & 0x3fff
      const height = buffer.readUInt16LE(start + 8) & 0x3fff
      if (dimensions && (dimensions.width !== width || dimensions.height !== height)) return null
      dimensions = { contentType: 'image/webp', width, height }
      hasData = true
    } else if (type === 'VP8L') {
      if (length < 5 || buffer[start] !== 0x2f || (buffer[start + 4] >> 5) !== 0) return null
      const bits = buffer.readUInt32LE(start + 1)
      const width = 1 + (bits & 0x3fff)
      const height = 1 + ((bits >>> 14) & 0x3fff)
      if (dimensions && (dimensions.width !== width || dimensions.height !== height)) return null
      dimensions = { contentType: 'image/webp', width, height }
      hasData = true
    }
    if (end === buffer.length) return hasData ? dimensions : null
    offset = end
  }
  return null
}

/** SVG is intentionally stored unchanged; the UI asks users to accept its risks. */
export function inspectDownloadedImage(buffer: Buffer, _declaredType = '', options: ImageSizeOptions = {}): { contentType: string; width?: number; height?: number } {
  if (buffer.length > getMaxBytes(options)) throw new RemoteImageTooLargeError('Logo image is too large')
  if (!buffer.length) throw new Error('Logo image is empty')
  if (detectLogoContentType(buffer) === 'image/svg+xml') {
    return { contentType: 'image/svg+xml' }
  }
  return inspectRasterImage(buffer, '', options)
}

/** Verify raster signatures and bounded container structure, never a URL suffix or MIME alone. */
export function inspectRasterImage(buffer: Buffer, declaredType = '', options: ImageSizeOptions = {}): RasterMeta {
  if (buffer.length > getMaxBytes(options)) throw new RemoteImageTooLargeError('Logo image is too large')
  const meta = inspectPng(buffer) ?? inspectJpeg(buffer) ?? inspectWebp(buffer) ??
    inspectAdditionalRaster(buffer, detectLogoContentType(buffer))
  const normalizedType: string = LOGO_MIME_BY_EXTENSION[LOGO_EXTENSION_BY_MIME[declaredType]] ?? declaredType
  if (!meta || !Number.isInteger(meta.width) || !Number.isInteger(meta.height) ||
      meta.width <= 0 || meta.height <= 0 || meta.width > 16384 || meta.height > 16384 ||
      meta.width * meta.height > 40_000_000 ||
      (normalizedType && normalizedType !== 'application/octet-stream' && normalizedType !== meta.contentType)) {
    throw new Error('Logo is not a supported PNG, JPG, WEBP, GIF, ICO, AVIF or BMP image')
  }
  return meta
}
