import { getComputedCacheEntry, setComputedCache } from './computed-cache-store.service'
import {
  DEFAULT_WORKER_LITE_CACHE_TTL_SECONDS,
  getWorkerLiteCacheValue,
  setWorkerLiteCacheValue
} from './worker-lite-cache.service'

const inflightLoads = new Map<string, Promise<unknown>>()

export async function withWorkerTieredCache<T>(
  namespace: string,
  cacheKey: string,
  loader: () => Promise<T>,
  storageTtlSeconds: number,
  memoryTtlSeconds = DEFAULT_WORKER_LITE_CACHE_TTL_SECONDS
) {
  const resolvedMemoryTtlSeconds = Math.min(memoryTtlSeconds, storageTtlSeconds)
  const resolvedKey = `${namespace}:${cacheKey}`
  const cached = await getWorkerLiteCacheValue<T>(namespace, cacheKey)
  if (cached !== null) {
    return cached
  }

  const inflight = inflightLoads.get(resolvedKey) as Promise<T> | undefined
  if (inflight) {
    return inflight
  }

  const loadPromise = (async () => {
    const persistentEntry = await getComputedCacheEntry<T>(namespace, cacheKey)
    if (persistentEntry) {
      const remainingTtlSeconds = Math.max(
        0,
        Math.ceil((persistentEntry.expiresAt.getTime() - Date.now()) / 1000)
      )

      if (remainingTtlSeconds > 0) {
        await setWorkerLiteCacheValue(
          namespace,
          cacheKey,
          persistentEntry.value,
          Math.min(resolvedMemoryTtlSeconds, remainingTtlSeconds)
        )
      }

      return persistentEntry.value
    }

    const value = await loader()
    await setComputedCache(namespace, cacheKey, value, storageTtlSeconds)
    await setWorkerLiteCacheValue(namespace, cacheKey, value, resolvedMemoryTtlSeconds)
    return value
  })().finally(() => {
    inflightLoads.delete(resolvedKey)
  })

  inflightLoads.set(resolvedKey, loadPromise)
  return loadPromise
}
