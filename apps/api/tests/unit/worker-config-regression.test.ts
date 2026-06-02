import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('worker runtime locale wiring', () => {
  afterEach(() => {
    delete process.env.DEFAULT_APP_LOCALE
    vi.resetModules()
  })

  it('reads DEFAULT_APP_LOCALE from worker bindings when runtime context is present', async () => {
    const { runWithRuntimeContext } = await import('../../src/runtime')
    const { config } = await import('../../src/config')

    const locale = runWithRuntimeContext(
      {
        bindings: {
          DB: {} as never,
          DEFAULT_APP_LOCALE: 'en-US'
        }
      },
      () => config.defaultAppLocale
    )

    expect(locale).toBe('en-US')
  })

  it('declares DEFAULT_APP_LOCALE in wrangler vars for worker deployments', () => {
    const wranglerConfig = readFileSync(new URL('../../../../wrangler.jsonc', import.meta.url), 'utf8')

    expect(wranglerConfig).toContain('"DEFAULT_APP_LOCALE": "zh-CN"')
  })
})
