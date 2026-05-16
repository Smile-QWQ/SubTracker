import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const PERF_ROOT = path.resolve(process.cwd(), '.tmp', 'perf')
export const PERF_FIXTURE_DIR = path.join(PERF_ROOT, 'fixtures')
export const PERF_RESULT_DIR = path.join(PERF_ROOT, 'results')
export const PERF_PROFILE_DIR = path.join(PERF_ROOT, 'profiles')
export const PERF_REPORT_DIR = path.join(PERF_ROOT, 'reports')

export const DEFAULTS = {
  subscriptions: 100,
  tags: 20,
  paymentsPerSubscription: 10,
  repeat: 20,
  warmup: 3,
  mode: 'mixed',
  channelMode: 'none'
}

export async function ensurePerfDirs() {
  await Promise.all([
    mkdir(PERF_ROOT, { recursive: true }),
    mkdir(PERF_FIXTURE_DIR, { recursive: true }),
    mkdir(PERF_RESULT_DIR, { recursive: true }),
    mkdir(PERF_PROFILE_DIR, { recursive: true }),
    mkdir(PERF_REPORT_DIR, { recursive: true })
  ])
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      result[key] = true
      continue
    }
    result[key] = next
    index += 1
  }
  return result
}

export function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export function fixtureLabel(meta) {
  const channelSuffix = meta.channelMode && meta.channelMode !== 'none' ? `-${meta.channelMode}` : ''
  return `${meta.subscriptions}subs-${meta.mode}${channelSuffix}`
}

export function fixturePath(meta) {
  return path.join(PERF_FIXTURE_DIR, `${fixtureLabel(meta)}.json`)
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function appendJsonl(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'a' })
}

export function percentile(values, ratio) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

export function summarizeSeries(values) {
  return {
    p50: Number(percentile(values, 0.5).toFixed(2)),
    p95: Number(percentile(values, 0.95).toFixed(2)),
    max: Number(Math.max(...values, 0).toFixed(2))
  }
}

export function bytesOf(value) {
  return Buffer.byteLength(JSON.stringify(value))
}
