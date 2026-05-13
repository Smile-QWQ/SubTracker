import { spawn } from 'node:child_process'
import path from 'node:path'
import {
  DEFAULTS,
  PERF_PROFILE_DIR,
  PERF_RESULT_DIR,
  appendJsonl,
  ensurePerfDirs,
  fixtureLabel,
  fixturePath,
  nowStamp,
  parseArgs,
  toInt
} from './perf-lite-common.mjs'

function runTsScript(args) {
  return new Promise((resolve, reject) => {
    const sourceRootArgIndex = args.indexOf('--source-root')
    const sourceRoot =
      sourceRootArgIndex >= 0 && args[sourceRootArgIndex + 1]
        ? path.resolve(args[sourceRootArgIndex + 1])
        : process.cwd()
    const runnerPath = path.resolve(process.cwd(), 'scripts/perf-lite-measure-runner.ts')
    const child =
      process.platform === 'win32'
        ? spawn(
            'cmd.exe',
            ['/d', '/s', '/c', path.resolve(process.cwd(), 'node_modules/.bin/tsx.cmd'), runnerPath, ...args],
            {
              cwd: sourceRoot,
              stdio: ['inherit', 'pipe', 'pipe'],
              shell: false,
              env: {
                ...process.env
              }
            }
          )
        : spawn(path.resolve(process.cwd(), 'node_modules/.bin/tsx'), [runnerPath, ...args], {
            cwd: sourceRoot,
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: false,
            env: {
              ...process.env
            }
          })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`perf-lite-measure-runner exited with code ${code ?? 1}`))
    })
  })
}

async function main() {
  const args = parseArgs()
  const targets = String(args.target ?? 'overview,cron')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const repeat = toInt(args.repeat, DEFAULTS.repeat)
  const warmup = toInt(args.warmup, DEFAULTS.warmup)
  const fixtureMeta = {
    subscriptions: toInt(args.subscriptions, DEFAULTS.subscriptions),
    tags: toInt(args.tags, DEFAULTS.tags),
    paymentsPerSubscription: toInt(args['payments-per-subscription'], DEFAULTS.paymentsPerSubscription),
    mode: String(args.mode ?? DEFAULTS.mode),
    channelMode: String(args['channel-mode'] ?? DEFAULTS.channelMode)
  }
  const profileEnabled = Boolean(args.profile)
  const profileName = String(args['profile-name'] ?? `${fixtureLabel(fixtureMeta)}-${targets.join('_')}-${nowStamp()}`)
  const resultPath = path.join(PERF_RESULT_DIR, `${fixtureLabel(fixtureMeta)}-${nowStamp()}.jsonl`)
  const sourceRoot = String(args['source-root'] ?? process.cwd())
  const cronDryRun = String(args['cron-dry-run'] ?? 'false') === 'true'

  await ensurePerfDirs()

  const childArgs = [
    '--fixture',
    fixturePath(fixtureMeta),
    '--target',
    targets.join(','),
    '--repeat',
    String(repeat),
    '--warmup',
    String(warmup),
    '--result-path',
    resultPath,
    '--profile-name',
    profileName,
    '--profile-dir',
    PERF_PROFILE_DIR,
    '--source-root',
    sourceRoot,
    '--cron-dry-run',
    cronDryRun ? 'true' : 'false'
  ]
  if (profileEnabled) {
    childArgs.push('--profile')
  }

  await runTsScript(childArgs)

  await appendJsonl(resultPath.replace(/\.jsonl$/, '.meta.jsonl'), {
    generatedAt: new Date().toISOString(),
    fixture: fixtureLabel(fixtureMeta),
    targets,
    repeat,
    warmup,
    profileEnabled
    ,
    cronDryRun
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
