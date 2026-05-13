import { Session } from 'node:inspector/promises'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { appendJsonl, bytesOf, fixtureLabel, parseArgs, readJson, summarizeSeries } from './perf-lite-common.mjs'

type ImportPayload = {
  filename: string
  manifest: unknown
  logoAssets: Array<{ path: string; filename: string; contentType: string; base64: string }>
}

function formatTable(rows: Array<{
  target: string
  cpu: { p50: number; p95: number; max: number }
  wall: { p50: number; p95: number; max: number }
  resultKb: number
}>) {
  const headers = ['target', 'p50_cpu', 'p95_cpu', 'max_cpu', 'p50_wall', 'p95_wall', 'result_kb']
  const matrix = [
    headers,
    ...rows.map((row) => [
      row.target,
      `${row.cpu.p50}ms`,
      `${row.cpu.p95}ms`,
      `${row.cpu.max}ms`,
      `${row.wall.p50}ms`,
      `${row.wall.p95}ms`,
      `${row.resultKb}KB`
    ])
  ]
  const widths = headers.map((_, index) => Math.max(...matrix.map((line) => String(line[index]).length)))
  return matrix
    .map((line, index) =>
      line.map((cell, cellIndex) => String(cell).padEnd(widths[cellIndex])).join('  ') +
      (index === 0 ? `\n${widths.map((size) => '-'.repeat(size)).join('  ')}` : '')
    )
    .join('\n')
}

async function withCpuProfile(enabled: boolean, profileName: string, profileDir: string, run: () => Promise<unknown>) {
  if (!enabled) {
    return run()
  }

  const session = new Session()
  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.start')

  try {
    const result = await run()
    const profile = await session.post('Profiler.stop')
    const profilePath = path.join(profileDir, `${profileName}.cpuprofile`)
    await writeFile(profilePath, JSON.stringify(profile.profile), 'utf8')
    return result
  } finally {
    session.disconnect()
  }
}

async function loadServices(sourceRoot: string) {
  const rootUrl = pathToFileURL(`${path.resolve(sourceRoot)}${path.sep}`)
  const [statisticsModule, notificationModule, subscriptionModule, backupModule] = await Promise.all([
    import(new URL('apps/api/src/services/statistics.service.ts', rootUrl).href),
    import(new URL('apps/api/src/services/notification.service.ts', rootUrl).href),
    import(new URL('apps/api/src/services/subscription.service.ts', rootUrl).href),
    import(new URL('apps/api/src/services/subtracker-backup.service.ts', rootUrl).href)
  ])

  return {
    getOverviewStatistics: statisticsModule.getOverviewStatistics as () => Promise<unknown>,
    scanRenewalNotifications: notificationModule.scanRenewalNotifications as (date?: Date, overrides?: Record<string, unknown>) => Promise<unknown>,
    autoRenewDueSubscriptions: subscriptionModule.autoRenewDueSubscriptions as (date?: Date) => Promise<unknown>,
    inspectSubtrackerBackupFile: backupModule.inspectSubtrackerBackupFile as (payload: ImportPayload) => Promise<{ importToken: string } & Record<string, unknown>>,
    commitSubtrackerBackup: backupModule.commitSubtrackerBackup as (payload: {
      importToken: string
      mode: 'append' | 'replace'
      restoreSettings: boolean
    }) => Promise<unknown>
  }
}

async function measureTarget(
  target: string,
  services: Awaited<ReturnType<typeof loadServices>>,
  importPayload: ImportPayload,
  options: {
    cronDryRun: boolean
  }
) {
  switch (target) {
    case 'overview':
      return services.getOverviewStatistics()
    case 'cron':
      return services.scanRenewalNotifications(new Date('2026-05-01T10:15:00+08:00'), options.cronDryRun ? { dryRun: true } : undefined)
    case 'auto-renew':
      return services.autoRenewDueSubscriptions(new Date('2026-05-01T10:15:00+08:00'))
    case 'import-inspect':
      return services.inspectSubtrackerBackupFile(importPayload)
    case 'import-commit': {
      const preview = await services.inspectSubtrackerBackupFile(importPayload)
      return services.commitSubtrackerBackup({
        importToken: preview.importToken,
        mode: 'append',
        restoreSettings: false
      })
    }
    default:
      throw new Error(`Unsupported target: ${target}`)
  }
}

async function main() {
  const args = parseArgs()
  const sourceRoot = String(args['source-root'] ?? process.cwd())
  const fixture = await readJson(String(args.fixture))
  const targets = String(args.target)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const repeat = Number.parseInt(String(args.repeat), 10)
  const warmup = Number.parseInt(String(args.warmup), 10)
  const resultPath = String(args['result-path'])
  const profileEnabled = Boolean(args.profile)
  const profileName = String(args['profile-name'])
  const profileDir = String(args['profile-dir'])
  const cronDryRun = String(args['cron-dry-run'] ?? 'false') === 'true'
  const services = await loadServices(sourceRoot)
  const importPayload: ImportPayload = {
    filename: `${fixtureLabel(fixture.meta)}.zip`,
    manifest: fixture.dataset.manifest,
    logoAssets: fixture.dataset.logoAssets
  }
  const summaryRows = []

  for (const target of targets) {
    const cpuValues: number[] = []
    const wallValues: number[] = []
    const resultSizeValues: number[] = []

    for (let index = 0; index < warmup + repeat; index += 1) {
      const startCpu = process.cpuUsage()
      const startWall = performance.now()
      const result = await withCpuProfile(profileEnabled && index === warmup, `${profileName}-${target}`, profileDir, async () =>
        measureTarget(target, services, importPayload, {
          cronDryRun
        })
      )
      const cpuUsage = process.cpuUsage(startCpu)
      const wallMs = performance.now() - startWall
      const cpuUserMs = cpuUsage.user / 1000
      const cpuSystemMs = cpuUsage.system / 1000
      const cpuTotalMs = cpuUserMs + cpuSystemMs
      const resultSizeBytes = bytesOf(result)

      if (index >= warmup) {
        cpuValues.push(cpuTotalMs)
        wallValues.push(wallMs)
        resultSizeValues.push(resultSizeBytes)

        await appendJsonl(resultPath, {
          target,
          dataset: fixtureLabel(fixture.meta),
          iteration: index - warmup + 1,
          wallMs: Number(wallMs.toFixed(2)),
          cpuUserMs: Number(cpuUserMs.toFixed(2)),
          cpuSystemMs: Number(cpuSystemMs.toFixed(2)),
          cpuTotalMs: Number(cpuTotalMs.toFixed(2)),
          heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
          resultSizeBytes,
          rows: {
            subscriptions: fixture.dataset.subscriptions.length,
            tags: fixture.dataset.tags.length,
            paymentRecords: fixture.dataset.paymentRecords.length
          }
        })
      }
    }

    summaryRows.push({
      target,
      cpu: summarizeSeries(cpuValues),
      wall: summarizeSeries(wallValues),
      resultKb: Number((summarizeSeries(resultSizeValues).p95 / 1024).toFixed(2))
    })
  }

  console.log(formatTable(summaryRows))
  console.log(
    JSON.stringify({
      ok: true,
      sourceRoot,
      fixture: fixtureLabel(fixture.meta),
      resultPath,
      targets
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
