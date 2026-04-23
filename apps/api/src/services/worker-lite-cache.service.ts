const DEFAULT_CACHE_TTL_SECONDS = 30
const CACHE_KEY_PREFIX = 'liteMemoryCache:'

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const memoryCache = new Map<string, CacheEntry<unknown>>()
const inflightLoads = new Map<string, Promise<unknown>>()

function now() {
  return Date.now()
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

async function getCacheValue<T>(key: string) {
  return getMemoryCache<T>(key)
}

async function setCacheValue<T>(key: string, value: T, ttlSeconds: number) {
  setMemoryCache(key, value, ttlSeconds)
}

export async function withWorkerLiteCache<T>(
  namespace: string,
  cacheKey: string,
  loader: () => Promise<T>,
  ttlSeconds = DEFAULT_CACHE_TTL_SECONDS
) {
  const resolvedKey = `${CACHE_KEY_PREFIX}${namespace}:${cacheKey}`
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
  for (const namespace of new Set(namespaces)) {
    const prefix = `${CACHE_KEY_PREFIX}${namespace}:`
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key)
      }
    }
  }
}
