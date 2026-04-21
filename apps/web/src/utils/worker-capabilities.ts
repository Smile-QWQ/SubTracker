import type { Settings } from '@/types/api'

type PartialSettings = Partial<Pick<Settings, 'storageCapabilities'>>

export function supportsLogoStorage(settings: PartialSettings) {
  return Boolean(settings.storageCapabilities?.logoStorageEnabled)
}

export function supportsManagedLogoLibrary(settings: PartialSettings) {
  return Boolean(settings.storageCapabilities?.logoStorageEnabled && settings.storageCapabilities?.r2Enabled)
}
