import type { LogoSearchResult } from '@/types/api'

type ResolveRemoteLogoApplicationOptions = {
  logoStorageEnabled: boolean
  currentWebsiteUrl?: string
}

type RemoteLogoApplicationResult =
  | {
      mode: 'import'
      logoUrl: string
      logoSource: string
      websiteUrl?: string
    }
  | {
      mode: 'direct'
      logoUrl: string
      logoSource: string
      websiteUrl?: string
    }

export function resolveRemoteLogoApplication(
  item: LogoSearchResult,
  options: ResolveRemoteLogoApplicationOptions
): RemoteLogoApplicationResult {
  const nextWebsiteUrl = item.websiteUrl && !options.currentWebsiteUrl ? item.websiteUrl : undefined

  if (!options.logoStorageEnabled) {
    return {
      mode: 'direct',
      logoUrl: item.logoUrl,
      logoSource: item.source,
      websiteUrl: nextWebsiteUrl
    }
  }

  return {
    mode: 'import',
    logoUrl: item.logoUrl,
    logoSource: item.source,
    websiteUrl: nextWebsiteUrl
  }
}
