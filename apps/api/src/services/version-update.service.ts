import type { ReleaseUpdateDto, VersionUpdateSummaryDto } from '@subtracker/shared'

const REPO_RELEASES_API = 'https://api.github.com/repos/Smile-QWQ/SubTracker/releases'

type GitHubRelease = {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string | null
  prerelease: boolean
  draft: boolean
}

type ParsedVersion = [number, number, number]

function normalizeVersionTag(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/^v/i, '')
}

function parseSemverLike(input: string): ParsedVersion | null {
  const normalized = normalizeVersionTag(input)
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareParsedVersions(a: ParsedVersion, b: ParsedVersion) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index]
    }
  }
  return 0
}

export function isVersionGreaterThan(currentVersion: string, candidateVersion: string) {
  const current = parseSemverLike(currentVersion)
  const candidate = parseSemverLike(candidateVersion)
  if (!current || !candidate) return false
  return compareParsedVersions(candidate, current) > 0
}

export async function getVersionUpdateSummary(currentVersion: string): Promise<VersionUpdateSummaryDto> {
  const normalizedCurrentVersion = normalizeVersionTag(currentVersion) || '0.0.0'
  const response = await fetch(REPO_RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SubTracker-Version-Checker'
    }
  })

  if (!response.ok) {
    throw new Error(`获取版本更新失败：HTTP ${response.status}`)
  }

  const releases = (await response.json()) as GitHubRelease[]
  const mappedReleases: ReleaseUpdateDto[] = releases
    .filter((item) => !item.draft)
    .map((item) => {
      const normalizedTag = normalizeVersionTag(item.tag_name)
      return {
        tagName: item.tag_name,
        version: normalizedTag,
        name: item.name?.trim() || item.tag_name,
        body: item.body?.trim() || '',
        htmlUrl: item.html_url,
        publishedAt: item.published_at || '',
        isPrerelease: item.prerelease
      }
    })
    .filter((item) => isVersionGreaterThan(normalizedCurrentVersion, item.version))
    .sort((a, b) => {
      const parsedA = parseSemverLike(a.version)
      const parsedB = parseSemverLike(b.version)
      if (!parsedA || !parsedB) return 0
      return compareParsedVersions(parsedB, parsedA)
    })

  return {
    currentVersion: normalizedCurrentVersion,
    latestVersion: mappedReleases[0]?.version ?? null,
    hasUpdate: mappedReleases.length > 0,
    releases: mappedReleases
  }
}
