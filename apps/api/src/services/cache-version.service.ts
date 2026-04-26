import { getSettingLite, setSettingLite } from './worker-lite-repository.service'

export type CacheVersionNamespace = 'statistics' | 'calendar' | 'exchangeRates' | 'settings'

function getCacheVersionKey(namespace: CacheVersionNamespace) {
  return `cacheVersion.${namespace}`
}

export async function getCacheVersion(namespace: CacheVersionNamespace) {
  return Number(await getSettingLite<number>(getCacheVersionKey(namespace), 0))
}

export async function bumpCacheVersions(namespaces: CacheVersionNamespace[]) {
  const uniqueNamespaces = Array.from(new Set(namespaces))
  if (uniqueNamespaces.length === 0) {
    return 0
  }

  const nextVersion = Date.now()
  await Promise.all(uniqueNamespaces.map((namespace) => setSettingLite(getCacheVersionKey(namespace), nextVersion)))
  return nextVersion
}
