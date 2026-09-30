import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRootDir } from '../../src/config'

vi.mock('../../src/db', () => ({ prisma: {} }))
beforeEach(() => { vi.resetModules(); vi.stubEnv('LOGO_STORAGE_DIR', '') })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('stable logo storage path', () => {
  it.each(['project-root', 'apps/api', 'unrelated-directory'])('does not depend on launch cwd: %s', async cwd => {
    vi.spyOn(process, 'cwd').mockReturnValue(path.resolve(apiRootDir, cwd))
    const { getLogoStorageDir } = await import('../../src/services/logo.service')
    expect(getLogoStorageDir()).toBe(path.join(apiRootDir, 'storage', 'logos'))
  })

  it('respects an explicit storage override', async () => {
    const override = path.resolve(apiRootDir, 'isolated-logo-test')
    vi.stubEnv('LOGO_STORAGE_DIR', override)
    const { getLogoStorageDir } = await import('../../src/services/logo.service')
    expect(getLogoStorageDir()).toBe(override)
  })
})
