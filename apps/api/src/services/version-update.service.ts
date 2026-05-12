import { config } from '../config'

const COMMITS_API = 'https://api.github.com/repos/Smile-QWQ/SubTracker/commits?sha=lite&per_page=30'

type GitHubCommitItem = {
  sha: string
  html_url: string
  commit: {
    message: string
    author?: {
      date?: string
    }
  }
}

function normalizeCommitHash(input: string) {
  return String(input ?? '').trim().toLowerCase()
}

function splitCommitMessage(message: string) {
  const normalized = String(message ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return {
      title: '更新提交',
      body: ''
    }
  }

  const [title, ...rest] = normalized.split('\n')
  return {
    title: title.trim() || '更新提交',
    body: rest.join('\n').trim()
  }
}

export async function getVersionUpdateSummary(currentVersion: string) {
  const normalizedCurrentVersion = normalizeCommitHash(currentVersion)
  const response = await fetch(COMMITS_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SubTracker-Lite-Version-Checker'
    }
  })

  if (!response.ok) {
    throw new Error(`获取版本更新失败：HTTP ${response.status}`)
  }

  const commits = (await response.json()) as GitHubCommitItem[]
  const latestVersion = commits[0]?.sha?.slice(0, 7) ?? null

  let updates = commits
  if (normalizedCurrentVersion) {
    const matchedIndex = commits.findIndex((item) => item.sha.toLowerCase().startsWith(normalizedCurrentVersion))
    if (matchedIndex >= 0) {
      updates = commits.slice(0, matchedIndex)
    }
  }

  const releases = updates.map((item) => {
    const parsed = splitCommitMessage(item.commit.message)
    const shortSha = item.sha.slice(0, 7)
    return {
      tagName: shortSha,
      version: shortSha,
      name: parsed.title,
      body: parsed.body || parsed.title,
      htmlUrl: item.html_url,
      publishedAt: item.commit.author?.date || '',
      isPrerelease: false
    }
  })

  return {
    currentVersion: normalizedCurrentVersion || config.appVersion || '',
    latestVersion,
    hasUpdate: releases.length > 0,
    releases
  }
}
