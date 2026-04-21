import crypto from 'node:crypto'
import { prisma } from '../db'
import type { LogoSearchInput, LogoSearchResultDto, LogoUploadInput } from '@subtracker/shared'
import { getWorkerCache, getWorkerLogoBucket } from '../runtime'

const SEARCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
const LOGO_REQUEST_TIMEOUT_MS = 20000
const SEARCH_CACHE_TTL_SECONDS = 5 * 60
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const SEARCH_CACHE_PREFIX = 'logo-search:worker-parity:'
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'])
const extensionMap: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg'
}

type RawCandidate = LogoSearchResultDto & {
  scoreHint?: number
  fallback?: boolean
}

type ImageMeta = {
  finalUrl: string
  contentType: string
  width?: number
  height?: number
  buffer: Buffer
}

type SearchCacheEntry = {
  expiresAt: number
  items: LogoSearchResultDto[]
}

const searchCache = new Map<string, SearchCacheEntry>()

function normalizeWebsiteUrl(input?: string) {
  if (!input) return ''
  try {
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
    const url = new URL(withProtocol)
    return url.origin
  } catch {
    return ''
  }
}

function deriveDomainSeed(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function resolveUrl(origin: string, value?: string | null) {
  if (!value) return ''
  try {
    return new URL(value, `${origin}/`).toString()
  } catch {
    return ''
  }
}

function sourcePriority(source: string) {
  switch (source) {
    case 'manifest':
    case 'manifest:any':
    case 'manifest:maskable':
    case 'manifest:monochrome':
      return 100
    case 'apple-touch-icon':
      return 96
    case 'html-icon':
      return 90
    case 'mask-icon':
      return 84
    case 'og-image':
      return 72
    case 'duckduckgo':
      return 80
    case 'brave':
      return 68
    case 'favicon':
      return 38
    case 'google-favicon':
      return 28
    case 'clearbit':
      return 24
    case 'icon-horse':
      return 22
    default:
      return 50
  }
}

function makeCandidate(
  list: RawCandidate[],
  label: string,
  logoUrl: string,
  source: string,
  options?: {
    websiteUrl?: string
    width?: number
    height?: number
    fallback?: boolean
  }
) {
  if (!logoUrl) return

  let normalizedUrl = ''
  try {
    normalizedUrl = new URL(logoUrl).toString()
  } catch {
    return
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) return
  if (list.some((item) => item.logoUrl === normalizedUrl)) return

  list.push({
    label,
    logoUrl: normalizedUrl,
    source,
    websiteUrl: options?.websiteUrl,
    width: options?.width,
    height: options?.height,
    fallback: options?.fallback ?? false,
    scoreHint: sourcePriority(source)
  })
}

async function cacheGet(key: string) {
  const kv = getWorkerCache()
  if (kv) {
    const raw = await kv.get(key, 'json')
    if (!raw) return null
    const entry = raw as SearchCacheEntry
    if (entry.expiresAt <= Date.now()) return null
    return entry
  }

  const cached = searchCache.get(key)
  if (!cached || cached.expiresAt <= Date.now()) {
    searchCache.delete(key)
    return null
  }
  return cached
}

async function cacheSet(key: string, items: LogoSearchResultDto[]) {
  const entry: SearchCacheEntry = {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    items
  }

  const kv = getWorkerCache()
  if (kv) {
    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: SEARCH_CACHE_TTL_SECONDS
    })
    return
  }

  searchCache.set(key, entry)
}

async function fetchText(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': SEARCH_USER_AGENT,
      ...headers
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(LOGO_REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.text()
}

async function fetchJson<T>(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': SEARCH_USER_AGENT,
      ...headers
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(LOGO_REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

function extractLinkMatches(html: string) {
  const matches: Array<{ rel: string; href: string }> = []
  const regex = /<link\b[^>]*rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi
  for (const match of html.matchAll(regex)) {
    matches.push({
      rel: (match[1] || '').toLowerCase(),
      href: match[2] || ''
    })
  }
  return matches
}

function extractMetaImageMatches(html: string) {
  const matches: string[] = []
  const regex = /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi
  for (const match of html.matchAll(regex)) {
    if (match[1]) matches.push(match[1])
  }
  return matches
}

async function fetchManifestCandidates(manifestUrl: string, websiteUrl: string) {
  const candidates: RawCandidate[] = []

  try {
    const manifest = await fetchJson<{ icons?: Array<{ src?: string; sizes?: string; purpose?: string }> }>(manifestUrl)
    for (const icon of manifest.icons ?? []) {
      const iconUrl = icon.src ? new URL(icon.src, manifestUrl).toString() : ''
      if (!iconUrl) continue

      const [width, height] = parseSizes(icon.sizes)
      const sizeLabel = icon.sizes ? ` (${icon.sizes})` : ''
      makeCandidate(candidates, `Manifest 图标${sizeLabel}`, iconUrl, icon.purpose ? `manifest:${icon.purpose}` : 'manifest', {
        websiteUrl,
        width,
        height
      })
    }
  } catch {
    return candidates
  }

  return candidates
}

function parseSizes(sizes?: string) {
  if (!sizes) return [undefined, undefined] as const
  const first = sizes.split(/\s+/).find((item) => /^\d+x\d+$/i.test(item))
  if (!first) return [undefined, undefined] as const
  const [width, height] = first.toLowerCase().split('x').map((item) => Number(item))
  return [Number.isFinite(width) ? width : undefined, Number.isFinite(height) ? height : undefined] as const
}

async function fetchWebsiteCandidates(origin: string) {
  const candidates: RawCandidate[] = []

  try {
    const html = await fetchText(origin)
    const links = extractLinkMatches(html)

    for (const link of links) {
      const href = resolveUrl(origin, link.href)
      if (!href) continue

      if (link.rel.includes('apple-touch-icon')) {
        makeCandidate(candidates, 'Apple Touch Icon', href, 'apple-touch-icon', { websiteUrl: origin })
      } else if (link.rel.includes('mask-icon')) {
        makeCandidate(candidates, 'Mask Icon', href, 'mask-icon', { websiteUrl: origin })
      } else if (link.rel.includes('icon')) {
        makeCandidate(candidates, '站点图标', href, 'html-icon', { websiteUrl: origin })
      } else if (link.rel.includes('manifest')) {
        const manifestCandidates = await fetchManifestCandidates(href, origin)
        manifestCandidates.forEach((item) => makeCandidate(candidates, item.label, item.logoUrl, item.source, item))
      }
    }

    for (const image of extractMetaImageMatches(html)) {
      const imageUrl = resolveUrl(origin, image)
      if (imageUrl) {
        makeCandidate(candidates, '站点分享图', imageUrl, 'og-image', { websiteUrl: origin })
      }
    }
  } catch {
    return candidates
  }

  return candidates
}

async function getDuckDuckGoVqd(searchTerm: string) {
  try {
    const html = await fetchText(`https://duckduckgo.com/?q=${encodeURIComponent(searchTerm)}&ia=images`)
    const match = html.match(/vqd="?([\d-]+)"?/)
    return match?.[1] ?? ''
  } catch {
    return ''
  }
}

async function fetchDuckDuckGoCandidates(searchTerm: string) {
  const candidates: RawCandidate[] = []
  const vqd = await getDuckDuckGoVqd(searchTerm)
  if (!vqd) return candidates

  try {
    const params = new URLSearchParams({
      l: 'us-en',
      o: 'json',
      q: searchTerm,
      vqd,
      f: ',,transparent,Wide,',
      p: '1'
    })

    const data = await fetchJson<{
      results?: Array<{ image?: string; thumbnail?: string; width?: number; height?: number }>
    }>(`https://duckduckgo.com/i.js?${params.toString()}`, {
      Accept: 'application/json',
      Referer: 'https://duckduckgo.com/'
    })

    for (const [index, row] of (data.results ?? []).entries()) {
      const imageUrl = row.image || row.thumbnail || ''
      if (!imageUrl) continue

      makeCandidate(candidates, `DuckDuckGo 候选 ${index + 1}`, imageUrl, 'duckduckgo', {
        width: row.width,
        height: row.height
      })
      if (candidates.length >= 30) break
    }
  } catch {
    return candidates
  }

  return candidates
}

async function fetchBraveCandidates(searchTerm: string) {
  const candidates: RawCandidate[] = []

  try {
    const html = await fetchText(`https://search.brave.com/images?q=${encodeURIComponent(searchTerm)}`, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://search.brave.com/'
    })

    const imageRegex = /<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi
    for (const [index, match] of Array.from(html.matchAll(imageRegex)).entries()) {
      const imageUrl = match[1] || ''
      if (!/^https?:\/\//i.test(imageUrl)) continue
      if (imageUrl.includes('cdn.search.brave.com')) continue
      if (/favicon|logo\.svg/i.test(imageUrl)) continue

      makeCandidate(candidates, `Brave 候选 ${index + 1}`, imageUrl, 'brave')
      if (candidates.length >= 24) break
    }
  } catch {
    return candidates
  }

  return candidates
}

function inferContentTypeFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (pathname.endsWith('.png')) return 'image/png'
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg'
    if (pathname.endsWith('.webp')) return 'image/webp'
    if (pathname.endsWith('.svg')) return 'image/svg+xml'
  } catch {
    return ''
  }
  return ''
}

function getImageDimensions(buffer: Buffer, contentType: string) {
  if (contentType === 'image/png') {
    if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
      }
    }
  }

  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    let offset = 2
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        }
      }
      offset += 2 + length
    }
  }

  if (contentType === 'image/webp' && buffer.length >= 30) {
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      }
    }
  }

  if (contentType === 'image/svg+xml') {
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 4096))
    const widthMatch = text.match(/\bwidth=["']?([\d.]+)(?:px)?["']?/i)
    const heightMatch = text.match(/\bheight=["']?([\d.]+)(?:px)?["']?/i)
    if (widthMatch && heightMatch) {
      return {
        width: Number(widthMatch[1]),
        height: Number(heightMatch[1])
      }
    }
    const viewBoxMatch = text.match(/\bviewBox=["'][^"']*?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)["']/i)
    if (viewBoxMatch) {
      return {
        width: Number(viewBoxMatch[1]),
        height: Number(viewBoxMatch[2])
      }
    }
  }

  return {}
}

async function inspectRemoteImage(url: string): Promise<ImageMeta | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': SEARCH_USER_AGENT,
        Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(LOGO_REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) return null

    const headerType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const contentType = headerType || inferContentTypeFromUrl(response.url || url)
    if (!allowedTypes.has(contentType)) return null

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (!buffer.length) return null

    const { width, height } = getImageDimensions(buffer, contentType)

    return {
      finalUrl: response.url || url,
      contentType,
      width,
      height,
      buffer
    }
  } catch {
    return null
  }
}

function passesQualityFilter(meta: ImageMeta, source: string) {
  const { width, height } = meta

  if (!width || !height) {
    return sourcePriority(source) >= 80
  }

  if (width < 48 || height < 48) return false

  const ratio = width / height
  if (ratio > 4 || ratio < 0.25) return false

  const area = width * height
  if (area < 2304) return false

  return true
}

function computeScore(candidate: RawCandidate, meta: ImageMeta) {
  let score = candidate.scoreHint ?? sourcePriority(candidate.source)
  const width = meta.width ?? candidate.width ?? 0
  const height = meta.height ?? candidate.height ?? 0

  if (width && height) {
    score += Math.min(Math.min(width, height) / 8, 24)
    const ratio = width / height
    if (ratio >= 0.75 && ratio <= 1.5) score += 12
    else if (ratio >= 0.45 && ratio <= 2.2) score += 6
    else score -= 18
  } else {
    score -= 8
  }

  if (candidate.fallback) score -= 15
  return score
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let index = 0

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current])
    }
  })

  await Promise.all(runners)
  return results
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = getKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function filenameFromLogoUrl(logoUrl: string) {
  const pathname = new URL(logoUrl, 'http://localhost').pathname
  const segments = pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

export async function searchSubscriptionLogos(params: LogoSearchInput) {
  const cacheKey = `${SEARCH_CACHE_PREFIX}${JSON.stringify({
    name: params.name.trim().toLowerCase(),
    websiteUrl: params.websiteUrl?.trim().toLowerCase() ?? '',
    tagName: params.tagName?.trim().toLowerCase() ?? ''
  })}`
  const cached = await cacheGet(cacheKey)
  if (cached) {
    return cached.items
  }

  const explicitOrigin = normalizeWebsiteUrl(params.websiteUrl)
  const fallbackSeed = deriveDomainSeed(params.name)
  const guessedOrigin = explicitOrigin || (fallbackSeed ? `https://${fallbackSeed}.com` : '')
  const searchTerm = [params.name, params.tagName].filter(Boolean).join(' ').trim() || params.name

  const rawCandidates: RawCandidate[] = []
  const [websiteCandidates, duckCandidates, braveCandidates] = await Promise.all([
    guessedOrigin ? fetchWebsiteCandidates(guessedOrigin) : Promise.resolve<RawCandidate[]>([]),
    fetchDuckDuckGoCandidates(`${searchTerm} logo`),
    fetchBraveCandidates(`${searchTerm} logo`)
  ])

  if (guessedOrigin) {
    const hostname = new URL(guessedOrigin).hostname
    websiteCandidates.forEach((item) => makeCandidate(rawCandidates, item.label, item.logoUrl, item.source, item))

    makeCandidate(rawCandidates, '站点 favicon', `${guessedOrigin}/favicon.ico`, 'favicon', {
      websiteUrl: guessedOrigin,
      fallback: true
    })
    makeCandidate(
      rawCandidates,
      'Google Favicon',
      `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(guessedOrigin)}`,
      'google-favicon',
      {
        websiteUrl: guessedOrigin,
        fallback: true,
        width: 256,
        height: 256
      }
    )
    makeCandidate(rawCandidates, 'Icon Horse', `https://icon.horse/icon/${hostname}`, 'icon-horse', {
      websiteUrl: guessedOrigin,
      fallback: true
    })
    makeCandidate(rawCandidates, 'Clearbit Logo', `https://logo.clearbit.com/${hostname}`, 'clearbit', {
      websiteUrl: guessedOrigin,
      fallback: true
    })
  }

  duckCandidates.forEach((item) => makeCandidate(rawCandidates, item.label, item.logoUrl, item.source, item))
  braveCandidates.forEach((item) => makeCandidate(rawCandidates, item.label, item.logoUrl, item.source, item))

  const prepared = rawCandidates
    .sort((a, b) => (b.scoreHint ?? 0) - (a.scoreHint ?? 0))
    .slice(0, 40)

  const inspected = await mapWithConcurrency(prepared, 4, async (candidate) => {
    const meta = await inspectRemoteImage(candidate.logoUrl)
    if (!meta) return null
    if (!passesQualityFilter(meta, candidate.source)) return null

    return {
      ...candidate,
      logoUrl: meta.finalUrl,
      width: meta.width ?? candidate.width,
      height: meta.height ?? candidate.height,
      score: computeScore(candidate, meta)
    }
  })

  const result = dedupeBy(
    inspected
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 24),
    (item) => item.logoUrl
  ).map(({ score, scoreHint, fallback, ...item }) => item)

  await cacheSet(cacheKey, result)

  return result
}

function decodeBase64(value: string) {
  const binary = atob(value.trim())
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function isLocalLogoUrl(url?: string | null) {
  return Boolean(url && url.startsWith('/static/logos/'))
}

function createLogoUrl(key: string) {
  return `/static/logos/${encodeURIComponent(key)}`
}

async function writeLogoBuffer(buffer: Buffer | Uint8Array, contentType: string, logoSource: string) {
  const bucket = getWorkerLogoBucket()
  if (!bucket) {
    throw new Error('对象存储未启用，无法保存 Logo 文件')
  }

  const filename = `logos/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extensionMap[contentType] ?? '.png'}`
  await bucket.put(filename, buffer, {
    httpMetadata: {
      contentType
    }
  })

  return {
    logoUrl: createLogoUrl(filename),
    logoSource
  }
}

export async function saveImportedLogoBuffer(buffer: Buffer, contentType: string, logoSource = 'wallos-zip') {
  if (!allowedTypes.has(contentType)) {
    throw new Error('不支持的 Logo 图片类型')
  }
  if (!buffer.length) {
    throw new Error('Logo 图片内容为空')
  }
  return writeLogoBuffer(buffer, contentType, logoSource)
}

export async function saveUploadedLogo(input: LogoUploadInput) {
  if (!allowedTypes.has(input.contentType)) {
    throw new Error('仅支持 PNG、JPG、WEBP、SVG 图片')
  }

  const buffer = decodeBase64(input.base64)
  if (!buffer.length) {
    throw new Error('图片内容为空')
  }

  return writeLogoBuffer(buffer, input.contentType, 'upload')
}

export async function importRemoteLogo(input: { logoUrl: string; source?: string }) {
  const meta = await inspectRemoteImage(input.logoUrl)
  if (!meta) {
    throw new Error('远程 Logo 下载失败或图片不可用')
  }

  return writeLogoBuffer(meta.buffer, meta.contentType, input.source || 'remote')
}

export async function normalizeLogoForStorage(input: { logoUrl?: string | null; logoSource?: string | null }) {
  if (!input.logoUrl) {
    return {
      logoUrl: null,
      logoSource: input.logoSource ?? null,
      logoFetchedAt: null as Date | null
    }
  }

  if (isLocalLogoUrl(input.logoUrl)) {
    return {
      logoUrl: input.logoUrl,
      logoSource: input.logoSource ?? 'upload',
      logoFetchedAt: new Date()
    }
  }

  if (/^https?:\/\//i.test(input.logoUrl)) {
    if (!getWorkerLogoBucket()) {
      return {
        logoUrl: input.logoUrl,
        logoSource: input.logoSource ?? 'remote',
        logoFetchedAt: null as Date | null
      }
    }

    const imported = await importRemoteLogo({
      logoUrl: input.logoUrl,
      source: input.logoSource ?? 'remote'
    })

    return {
      logoUrl: imported.logoUrl,
      logoSource: imported.logoSource,
      logoFetchedAt: new Date()
    }
  }

  return {
    logoUrl: input.logoUrl,
    logoSource: input.logoSource ?? null,
    logoFetchedAt: new Date()
  }
}

export async function getLocalLogoLibrary() {
  const bucket = getWorkerLogoBucket()
  if (!bucket) {
    return []
  }

  const files = await bucket.list()
  const objects = files.objects.filter((item) => item.key.startsWith('logos/'))

  const localSubscriptions = await prisma.subscription.findMany({
    where: {
      logoUrl: {
        startsWith: '/static/logos/'
      }
    },
    select: {
      name: true,
      logoUrl: true,
      logoSource: true,
      updatedAt: true
    }
  })

  const map = new Map<string, LogoSearchResultDto>()

  for (const row of localSubscriptions) {
    if (!row.logoUrl) continue
    const existing = map.get(row.logoUrl)
    const filename = filenameFromLogoUrl(row.logoUrl)
    if (!existing) {
      map.set(row.logoUrl, {
        label: row.name,
        logoUrl: row.logoUrl,
        source: row.logoSource ?? 'local',
        isLocal: true,
        filename,
        updatedAt: row.updatedAt.toISOString(),
        usageCount: 1,
        relatedSubscriptionNames: [row.name]
      })
      continue
    }

    existing.usageCount = (existing.usageCount ?? 0) + 1
    existing.relatedSubscriptionNames = Array.from(new Set([...(existing.relatedSubscriptionNames ?? []), row.name])).slice(0, 3)
    if (!existing.updatedAt || existing.updatedAt < row.updatedAt.toISOString()) {
      existing.updatedAt = row.updatedAt.toISOString()
      existing.label = row.name
    }
  }

  for (const file of objects) {
    const logoUrl = createLogoUrl(file.key)
    if (map.has(logoUrl)) continue
    map.set(logoUrl, {
      label: '未使用 Logo',
      logoUrl,
      source: 'local-file',
      isLocal: true,
      filename: file.key,
      updatedAt: file.uploaded?.toISOString() ?? new Date(0).toISOString(),
      usageCount: 0,
      relatedSubscriptionNames: []
    })
  }

  return Array.from(map.values()).sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt ?? 0).valueOf() - new Date(a.updatedAt ?? 0).valueOf()
    if (updatedDiff !== 0) return updatedDiff
    return (b.usageCount ?? 0) - (a.usageCount ?? 0)
  })
}

export async function deleteLocalLogoFromLibrary(filename: string) {
  const bucket = getWorkerLogoBucket()
  if (!bucket) {
    throw new Error('对象存储未启用，无法删除 Logo')
  }

  const safeName = filename.trim()
  if (!safeName) {
    throw new Error('无效的 Logo 文件名')
  }

  const logoUrl = createLogoUrl(safeName)
  const usageCount = await prisma.subscription.count({
    where: {
      logoUrl
    }
  })

  if (usageCount > 0) {
    throw new Error('该 Logo 已被订阅使用，不能删除')
  }

  await bucket.delete(safeName)

  return {
    filename: safeName,
    logoUrl,
    deleted: true
  }
}
