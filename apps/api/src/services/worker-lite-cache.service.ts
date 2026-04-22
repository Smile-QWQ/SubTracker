import { getWorkerCache } from '../runtime'

const DEFAULT_CACHE_TTL_SECONDS = 30
const KV_MIN_EXPIRATION_TTL_SECONDS = 60
const CACHE_VALUE_PREFIX = 'liteCache:'
const CACHE_VERSION_PREFIX = 'liteCacheVersion:'

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const memoryCache = new Map<string, CacheEntry<unknown>>()
const memoryVersions = new Map<string, number>()
const inflightLoads = new Map<string, Promise<unknown>>()

function now() {
  return Date.now()
}

function getMemoryVersion(namespace: string) {
  return memoryVersions.get(namespace) ?? 0
}

function setMemoryVersion(namespace: string, version: number) {
  memoryVersions.set(namespace, version)
}

function getMemoryCache<T>(key: string) {
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined
  if (!cached) return null
  if (cached.expiresAt <= now()) {
    memoryCache.delete(key)
    return null
  }
  return cached.value
}

function setMemoryCache<T>(key: string, value: T, ttlSeconds: number) {
  memoryCache.set(key, {
    value,
    expiresAt: now() + ttlSeconds * 1000
  })
}

async function getNamespaceVersion(namespace: string) {
  const cache = getWorkerCache()
  if (!cache) {
    return getMemoryVersion(namespace)
  }

  const raw = await cache.get(`${CACHE_VERSION_PREFIX}${namespace}`, 'text')
  return raw ? Number(raw) || 0 : 0
}

async function bumpNamespaceVersion(namespace: string) {
  const nextVersion = (await getNamespaceVersion(namespace)) + 1
  const cache = getWorkerCache()
  if (cache) {
    await cache.put(`${CACHE_VERSION_PREFIX}${namespace}`, String(nextVersion))
  }
  setMemoryVersion(namespace, nextVersion)
}

async function getCacheValue<T>(key: string) {
  const cache = getWorkerCache()
  if (cache) {
    const cached = (await cache.get(key, 'json')) as CacheEntry<T> | null
    if (cached && cached.expiresAt > now()) {
      return cached.value
    }
  }

  return getMemoryCache<T>(key)
}

async function setCacheValue<T>(key: string, value: T, ttlSeconds: number) {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: now() + ttlSeconds * 1000
  }

  const cache = getWorkerCache()
  if (cache) {
    await cache.put(key, JSON.stringify(entry), {
      expirationTtl: Math.max(ttlSeconds, KV_MIN_EXPIRATION_TTL_SECONDS)
    })
  }

  setMemoryCache(key, value, ttlSeconds)
}

export async function withWorkerLiteCache<T>(
  namespace: string,
  cacheKey: string,
  loader: () => Promise<T>,
  ttlSeconds = DEFAULT_CACHE_TTL_SECONDS
) {
  const version = await getNamespaceVersion(namespace)
  const resolvedKey = `${CACHE_VALUE_PREFIX}${namespace}:v${version}:${cacheKey}`
  const cached = await getCacheValue<T>(resolvedKey)
  if (cached !== null) {
    return cached
  }

  const inflight = inflightLoads.get(resolvedKey) as Promise<T> | undefined
  if (inflight) {
    return inflight
  }

  const loadPromise = (async () => {
    const value = await loader()
    await setCacheValue(resolvedKey, value, ttlSeconds)
    return value
  })().finally(() => {
    inflightLoads.delete(resolvedKey)
  })

  inflightLoads.set(resolvedKey, loadPromise)
  return loadPromise
}

export async function invalidateWorkerLiteCache(namespaces: string[]) {
  await Promise.all(Array.from(new Set(namespaces)).map((namespace) => bumpNamespaceVersion(namespace)))
}
