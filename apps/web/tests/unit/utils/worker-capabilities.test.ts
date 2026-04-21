import { describe, expect, it } from 'vitest'
import { supportsLogoStorage, supportsManagedLogoLibrary } from '@/utils/worker-capabilities'

describe('worker capabilities helpers', () => {
  it('detects logo storage from settings capabilities', () => {
    expect(
      supportsLogoStorage({
        storageCapabilities: {
          runtime: 'worker-lite',
          kvEnabled: true,
          r2Enabled: true,
          logoStorageEnabled: true,
          wallosImportMode: 'json-only'
        }
      })
    ).toBe(true)
  })

  it('treats missing capabilities as disabled storage', () => {
    expect(supportsLogoStorage({})).toBe(false)
    expect(
      supportsManagedLogoLibrary({
        storageCapabilities: {
          runtime: 'worker-lite',
          kvEnabled: false,
          r2Enabled: false,
          logoStorageEnabled: false,
          wallosImportMode: 'json-only'
        }
      })
    ).toBe(false)
  })
})
