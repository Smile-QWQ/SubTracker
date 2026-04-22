import { describe, expect, it } from 'vitest'
import { resolveRemoteLogoApplication } from '@/utils/logo-selection'

describe('resolveRemoteLogoApplication', () => {
  it('returns direct remote reference when logo storage is disabled', () => {
    const result = resolveRemoteLogoApplication(
      {
        label: 'Bilibili',
        logoUrl: 'https://example.com/bilibili.png',
        source: 'duckduckgo',
        websiteUrl: 'https://www.bilibili.com'
      },
      {
        logoStorageEnabled: false,
        currentWebsiteUrl: ''
      }
    )

    expect(result).toEqual({
      mode: 'direct',
      logoUrl: 'https://example.com/bilibili.png',
      logoSource: 'duckduckgo',
      websiteUrl: 'https://www.bilibili.com'
    })
  })

  it('returns import mode when logo storage is enabled', () => {
    const result = resolveRemoteLogoApplication(
      {
        label: 'Bilibili',
        logoUrl: 'https://example.com/bilibili.png',
        source: 'duckduckgo',
        websiteUrl: 'https://www.bilibili.com'
      },
      {
        logoStorageEnabled: true,
        currentWebsiteUrl: ''
      }
    )

    expect(result).toEqual({
      mode: 'import',
      logoUrl: 'https://example.com/bilibili.png',
      logoSource: 'duckduckgo',
      websiteUrl: 'https://www.bilibili.com'
    })
  })

  it('does not override existing website url during direct reference mode', () => {
    const result = resolveRemoteLogoApplication(
      {
        label: 'Bilibili',
        logoUrl: 'https://example.com/bilibili.png',
        source: 'duckduckgo',
        websiteUrl: 'https://www.bilibili.com'
      },
      {
        logoStorageEnabled: false,
        currentWebsiteUrl: 'https://already-set.example.com'
      }
    )

    expect(result.websiteUrl).toBeUndefined()
  })
})
