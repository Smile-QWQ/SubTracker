import { spawn } from 'node:child_process'
import path from 'node:path'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import {
  DEFAULTS,
  PERF_PROFILE_DIR,
  PERF_REPORT_DIR,
  PERF_RESULT_DIR,
  PERF_ROOT,
  ensurePerfDirs,
  fixtureLabel,
  parseArgs,
  summarizeSeries
} from './perf-lite-common.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_BASELINE_COMMIT = 'be70f8d'
const DEFAULT_CURRENT_COMMIT = '8b9468b'
const DEFAULT_TARGETS = [
  'login',
  'overview',
  'auto-renew',
  'scan-debug',
  'import-inspect',
  'import-commit',
  'subscription-detail',
  'subscription-payment-records'
]
const NODE_HARNESS = 'node'
const WORKER_HARNESS = 'worker-http'
const DEFAULT_PORT = 8787
const DEFAULT_INSPECTOR_PORT = 9229
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000
const DEFAULT_WORKER_BOOT_WAIT_MS = 1_500
const WORKER_STARTUP_TIMEOUT_MS = 60_000

function formatPct(value) {
  if (value === null || Number.isNaN(value)) {
    return ''
  }
  return Number(value.toFixed(2))
}

function computeDelta(current, baseline) {
  if (baseline === 0 || baseline === null || baseline === undefined) {
    return null
  }
  return ((current - baseline) / baseline) * 100
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function parseJsonLine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // keep scanning
    }
  }
  return null
}

function splitTargets(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function emptyDir(targetPath) {
  await rm(targetPath, { recursive: true, force: true })
  await mkdir(targetPath, { recursive: true })
}

async function removeIfExists(targetPath) {
  await rm(targetPath, { recursive: true, force: true }).catch(() => undefined)
}

function spawnWithCapture(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: options.shell ?? false
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      if (options.onStdout) {
        options.onStdout(text)
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      if (options.onStderr) {
        options.onStderr(text)
      }
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      resolve({
        code: code ?? 0,
        signal: signal ?? null,
        stdout,
        stderr
      })
    })
  })
}

async function runCommandOrThrow(command, args, options = {}) {
  const result = await spawnWithCapture(command, args, options)
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with code ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    )
  }
  return result
}

function buildWranglerEnv(phaseRoot) {
  const envRoot = path.join(phaseRoot, '.tmp', 'perf-runtime')
  const xdgRoot = path.join(envRoot, 'xdg')
  const appDataRoot = path.join(envRoot, 'appdata')
  const localAppDataRoot = path.join(envRoot, 'localappdata')
  const registryRoot = path.join(envRoot, 'wrangler-registry')
  const homeRoot = path.join(envRoot, 'home')
  return {
    envRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
      XDG_CONFIG_HOME: xdgRoot,
      APPDATA: appDataRoot,
      LOCALAPPDATA: localAppDataRoot,
      WRANGLER_REGISTRY_PATH: registryRoot,
      WRANGLER_LOG_SANITIZE: 'false'
    }
  }
}

async function prepareWranglerEnv(phaseRoot) {
  const wrangler = buildWranglerEnv(phaseRoot)
  await Promise.all([
    mkdir(wrangler.envRoot, { recursive: true }),
    mkdir(wrangler.env.HOME, { recursive: true }),
    mkdir(wrangler.env.XDG_CONFIG_HOME, { recursive: true }),
    mkdir(wrangler.env.APPDATA, { recursive: true }),
    mkdir(wrangler.env.LOCALAPPDATA, { recursive: true }),
    mkdir(wrangler.env.WRANGLER_REGISTRY_PATH, { recursive: true })
  ])
  return wrangler
}

function nodeExeFor(root) {
  return process.execPath
}

function prependRepoBinPath(env) {
  const rootBin = path.join(REPO_ROOT, 'node_modules', '.bin')
  const currentPath = env.PATH ?? env.Path ?? process.env.PATH ?? ''
  return {
    ...env,
    PATH: `${rootBin}${path.delimiter}${currentPath}`
  }
}

async function runNpm(root, args, env) {
  const mergedEnv = prependRepoBinPath(env)
  return runCommandOrThrow(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args, {
    cwd: root,
    env: mergedEnv,
    shell: false
  })
}

async function execGit(args, cwd = REPO_ROOT) {
  const result = await runCommandOrThrow('git', args, { cwd, env: process.env })
  return result.stdout.trim()
}

async function ensureCurrentDirtyStateIsToolOnly(expectedCommit, allowDirtyCurrent = false) {
  const head = await execGit(['rev-parse', '--short=7', 'HEAD'])
  if (head !== expectedCommit) {
    throw new Error(`Workspace HEAD=${head}, expected current commit ${expectedCommit}`)
  }

  if (allowDirtyCurrent) {
    return
  }

  const status = await execGit(['status', '--short'])
  const lines = status
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const allowedPrefixes = [
    'docs/',
    'scripts/perf-lite-'
  ]

  const disallowed = lines.filter((line) => {
    const match = line.match(/^[ MARCUD?!]{1,2}\s+(.+)$/)
    const file = match?.[1]?.replaceAll('\\', '/')
    if (!file) return true
    return !allowedPrefixes.some((prefix) => file.startsWith(prefix))
  })

  if (disallowed.length > 0) {
    throw new Error(`Current workspace contains non-tool dirty paths that cannot be mirrored into current snapshot:\n${disallowed.join('\n')}`)
  }
}

async function prepareCurrentSnapshot(snapshotRoot, commit, allowDirtyCurrent = false) {
  await ensureCurrentDirtyStateIsToolOnly(commit, allowDirtyCurrent)
  return snapshotRoot
}

async function copyMeasurementScripts(phaseRoot) {
  const scriptsDir = path.join(phaseRoot, 'scripts')
  await mkdir(scriptsDir, { recursive: true })
  const files = [
    'perf-lite-common.mjs',
    'perf-lite-seed.mjs',
    'perf-lite-worker-seed-d1.mjs',
    'perf-lite-measure.mjs',
    'perf-lite-measure-runner.ts',
    'perf-lite-worker-http.mjs'
  ]
  for (const file of files) {
    const source = path.join(REPO_ROOT, 'scripts', file)
    const destination = path.join(scriptsDir, file)
    const content = await readFile(source, 'utf8')
    await writeFile(destination, content, 'utf8')
  }
}

function resolveTsxBin() {
  return process.platform === 'win32'
    ? path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx')
}

function shouldRunWorkerTarget(target) {
  return target !== 'auto-renew'
}

function shouldRunNodeTarget(target) {
  return target !== 'login'
}

async function ensurePhaseNodeEnv(phaseRoot) {
  const envExamplePath = path.join(phaseRoot, 'apps', 'api', '.env.example')
  const envPath = path.join(phaseRoot, 'apps', 'api', '.env')
  const example = await readFile(envExamplePath, 'utf8')
  await writeFile(envPath, example, 'utf8')
  const prismaDbPath = path.join(phaseRoot, 'apps', 'api', 'prisma', 'dev.db')
  await rm(prismaDbPath, { force: true })
}

async function ensurePhaseBuild(phaseRoot, env) {
  await runNpm(phaseRoot, ['run', 'build:web'], env)
}

async function cleanupPort(port) {
  const command = [
    '$targets = Get-NetTCPConnection -LocalPort ' + port + ' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique;',
    'if ($targets) {',
    '  $targets | ForEach-Object {',
    '    try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {}',
    '  }',
    '}'
  ].join(' ')
  await runCommandOrThrow('powershell', ['-NoProfile', '-Command', command], {
    cwd: REPO_ROOT,
    env: process.env
  }).catch(() => undefined)
}

async function cleanupWorkerd() {
  await runCommandOrThrow('powershell', ['-NoProfile', '-Command', "Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force"], {
    cwd: REPO_ROOT,
    env: process.env
  }).catch(() => undefined)
}

async function startWorker(phaseRoot, env, options) {
  const runtimeRoot = path.join(phaseRoot, '.tmp', 'perf-runtime')
  const persistRoot = path.join(runtimeRoot, 'persist')
  const logRoot = path.join(runtimeRoot, 'logs')
  await Promise.all([mkdir(persistRoot, { recursive: true }), mkdir(logRoot, { recursive: true })])
  const outLog = path.join(logRoot, `wrangler-${options.phase}.out.log`)
  const errLog = path.join(logRoot, `wrangler-${options.phase}.err.log`)
  const wranglerCli = path.join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [
    wranglerCli,
    'dev',
    '--port',
    String(options.port),
    '--inspector-port',
    String(options.inspectorPort),
    '--persist-to',
    persistRoot,
    '--log-level',
    'debug'
  ]

  const child = spawn(process.execPath, args, {
    cwd: phaseRoot,
    env: prependRepoBinPath(env),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  })

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    stdout += text
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderr += text
  })

  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })

  const healthUrl = `http://127.0.0.1:${options.port}/health`
  const startDeadline = Date.now() + WORKER_STARTUP_TIMEOUT_MS

  while (Date.now() < startDeadline) {
    const exited = await Promise.race([
      exitPromise.then((value) => ({ type: 'exit', value })),
      new Promise((resolve) => setTimeout(() => resolve({ type: 'wait' }), 400))
    ])

    if (exited.type === 'exit') {
      await writeFile(outLog, stdout, 'utf8')
      await writeFile(errLog, stderr, 'utf8')
      throw new Error(`wrangler dev exited early for ${options.phase}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
    }

    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        await writeFile(outLog, stdout, 'utf8')
        await writeFile(errLog, stderr, 'utf8')
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_WORKER_BOOT_WAIT_MS))
        return {
          child,
          outLog,
          errLog,
          persistRoot,
          getStdout: () => stdout,
          getStderr: () => stderr
        }
      }
    } catch {
      // retry
    }
  }

  child.kill('SIGINT')
  await writeFile(outLog, stdout, 'utf8')
  await writeFile(errLog, stderr, 'utf8')
  throw new Error(`Timed out waiting for worker health on ${healthUrl}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
}

async function stopWorker(workerHandle) {
  if (!workerHandle?.child || workerHandle.child.killed) {
    return
  }
  workerHandle.child.kill('SIGINT')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        workerHandle.child.kill('SIGTERM')
      } catch {}
      resolve(null)
    }, 4_000)
    workerHandle.child.once('exit', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
  await writeFile(workerHandle.outLog, workerHandle.getStdout(), 'utf8')
  await writeFile(workerHandle.errLog, workerHandle.getStderr(), 'utf8')
}

async function waitForJsonEndpoint(inspectorPort) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < DEFAULT_HEALTH_TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${inspectorPort}/json`)
      if (response.ok) {
        const targets = await response.json()
        if (Array.isArray(targets) && targets[0]?.webSocketDebuggerUrl) {
          return targets[0]
        }
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Inspector endpoint http://127.0.0.1:${inspectorPort}/json did not become ready`)
}

async function withInspectorProfile(inspectorPort, run, outputPath) {
  const target = await waitForJsonEndpoint(inspectorPort)
  const socket = new WebSocket(target.webSocketDebuggerUrl)

  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })

  let seq = 0
  const pending = new Map()

  socket.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString())
      if (payload.id && pending.has(payload.id)) {
        const { resolve, reject } = pending.get(payload.id)
        pending.delete(payload.id)
        if (payload.error) {
          reject(new Error(payload.error.message ?? 'Unknown inspector error'))
          return
        }
        resolve(payload.result ?? {})
      }
    } catch {
      // ignore non-json message
    }
  })

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  try {
    await call('Profiler.enable')
    await call('Profiler.start')
    await run()
    const result = await call('Profiler.stop')
    await writeFile(outputPath, `${JSON.stringify(result.profile)}\n`, 'utf8')
  } finally {
    try {
      socket.close()
    } catch {}
  }
}

async function verifyCpuprofile(profilePath) {
  const text = await readFile(profilePath, 'utf8')
  const payload = JSON.parse(text)
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.samples)) {
    throw new Error(`Invalid cpuprofile structure: ${profilePath}`)
  }
}

async function verifyPhase(baseUrl) {
  const healthResponse = await fetch(`${baseUrl}/health`)
  if (!healthResponse.ok) {
    throw new Error(`Health check failed with status ${healthResponse.status}`)
  }

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin'
    })
  })

  if (!loginResponse.ok) {
    const text = await loginResponse.text()
    throw new Error(`Login check failed with status ${loginResponse.status}: ${text}`)
  }
}

async function fetchOverviewPayload(baseUrl) {
  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin'
    })
  })
  if (!loginResponse.ok) {
    const text = await loginResponse.text()
    throw new Error(`Overview login failed with status ${loginResponse.status}: ${text}`)
  }
  const loginPayload = await loginResponse.json()
  const token = loginPayload?.data?.token
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Overview login returned no token')
  }

  const response = await fetch(`${baseUrl}/api/v1/statistics/overview`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Overview request failed with status ${response.status}: ${text}`)
  }

  return JSON.parse(text)
}

async function runWorkerSeed(phaseRoot, env, fixtureOptions, baseUrl, persistTo) {
  const script = path.join(phaseRoot, 'scripts', 'perf-lite-worker-seed-d1.mjs')
  const args = [
    script,
    '--base-url',
    baseUrl,
    '--subscriptions',
    String(fixtureOptions.subscriptions),
    '--tags',
    String(fixtureOptions.tags),
    '--payments-per-subscription',
    String(fixtureOptions.paymentsPerSubscription),
    '--mode',
    fixtureOptions.mode
  ]
  if (persistTo) {
    args.push('--persist-to', persistTo)
  }
  const result = await runCommandOrThrow(process.execPath, args, {
    cwd: phaseRoot,
    env
  })
  return parseJsonLine(result.stdout)
}

async function runNodeSeed(phaseRoot, env, fixtureOptions) {
  const script = path.join(phaseRoot, 'scripts', 'perf-lite-seed.mjs')
  await runCommandOrThrow(
    process.execPath,
    [
      script,
      '--subscriptions',
      String(fixtureOptions.subscriptions),
      '--tags',
      String(fixtureOptions.tags),
      '--payments-per-subscription',
      String(fixtureOptions.paymentsPerSubscription),
      '--mode',
      fixtureOptions.mode
    ],
    {
      cwd: phaseRoot,
      env
    }
  )
}

async function runNodeHarness(phaseRoot, env, fixtureOptions, targets, resultPath, profileDir, profileName, warmup, repeat, subtrackerCommitMode) {
  await emptyDir(profileDir)
  const script = path.join(phaseRoot, 'scripts', 'perf-lite-measure.mjs')
  const runnerScript = path.join(phaseRoot, 'scripts', 'perf-lite-measure-runner.ts')
  const tsxBin = resolveTsxBin()
  const result = await runCommandOrThrow(
    process.execPath,
    [
      script,
      '--subscriptions',
      String(fixtureOptions.subscriptions),
      '--tags',
      String(fixtureOptions.tags),
      '--payments-per-subscription',
      String(fixtureOptions.paymentsPerSubscription),
      '--mode',
      fixtureOptions.mode,
      '--target',
      targets.join(','),
      '--repeat',
      String(repeat),
      '--warmup',
      String(warmup),
      '--result-path',
      resultPath,
      '--profile',
      '--profile-name',
      profileName,
      '--profile-dir',
      profileDir,
      '--runner-script',
      runnerScript,
      '--tsx-bin',
      tsxBin,
      '--cron-dry-run',
      'true',
      '--subtracker-commit-mode',
      subtrackerCommitMode
    ],
    {
      cwd: phaseRoot,
      env
    }
  )
  return parseJsonLine(result.stdout)
}

async function runNodeHarnessInBatches(
  phaseRoot,
  env,
  fixtureOptions,
  targets,
  resultPath,
  profileDir,
  profileName,
  warmup,
  repeat,
  subtrackerCommitMode
) {
  const mutatingTargets = targets.filter((target) => target === 'auto-renew')
  const regularTargets = targets.filter((target) => target !== 'auto-renew')

  if (regularTargets.length > 0) {
    await runNodeHarness(
      phaseRoot,
      env,
      fixtureOptions,
      regularTargets,
      resultPath,
      profileDir,
      profileName,
      warmup,
      repeat,
      subtrackerCommitMode
    )
  }

  if (mutatingTargets.length > 0) {
    await runNodeSeed(phaseRoot, env, fixtureOptions)
    await runNodeHarness(
      phaseRoot,
      env,
      fixtureOptions,
      mutatingTargets,
      resultPath,
      profileDir,
      profileName,
      0,
      1,
      subtrackerCommitMode
    )
  }
}

async function runWorkerHarness(phaseRoot, env, fixtureOptions, targets, baseUrl, repeat, warmup, resultPath, subtrackerCommitMode) {
  const script = path.join(phaseRoot, 'scripts', 'perf-lite-worker-http.mjs')
  const args = [
    script,
    '--base-url',
    baseUrl,
    '--subscriptions',
    String(fixtureOptions.subscriptions),
    '--tags',
    String(fixtureOptions.tags),
    '--payments-per-subscription',
    String(fixtureOptions.paymentsPerSubscription),
    '--mode',
    fixtureOptions.mode,
    '--target',
    targets.join(','),
    '--repeat',
    String(repeat),
    '--warmup',
    String(warmup),
    '--result-path',
    resultPath,
    '--subtracker-commit-mode',
    subtrackerCommitMode
  ]
  const result = await runCommandOrThrow(process.execPath, args, {
    cwd: phaseRoot,
    env
  })
  return parseJsonLine(result.stdout)
}

async function runWorkerHarnessInBatches(
  phaseRoot,
  env,
  fixtureOptions,
  targets,
  baseUrl,
  repeat,
  warmup,
  resultPath,
  subtrackerCommitMode
) {
  const loginTargets = targets.filter((target) => target === 'login')
  const regularTargets = targets.filter((target) => target !== 'login')

  if (loginTargets.length > 0) {
    await runWorkerHarness(
      phaseRoot,
      env,
      fixtureOptions,
      loginTargets,
      baseUrl,
      1,
      0,
      resultPath,
      subtrackerCommitMode
    )
  }

  if (regularTargets.length > 0) {
    await runWorkerHarness(
      phaseRoot,
      env,
      fixtureOptions,
      regularTargets,
      baseUrl,
      repeat,
      warmup,
      resultPath,
      subtrackerCommitMode
    )
  }
}

async function collectProfileTopFrames(profilePath, limit = 5) {
  const payload = JSON.parse(await readFile(profilePath, 'utf8'))
  const nodes = new Map((payload.nodes ?? []).map((node) => [node.id, node]))
  const hitMap = new Map()

  for (const sampleId of payload.samples ?? []) {
    hitMap.set(sampleId, (hitMap.get(sampleId) ?? 0) + 1)
  }

  return Array.from(hitMap.entries())
    .map(([id, hits]) => {
      const node = nodes.get(id)
      const callFrame = node?.callFrame ?? {}
      return {
        functionName: callFrame.functionName || '(anonymous)',
        url: callFrame.url || '',
        lineNumber: Number(callFrame.lineNumber ?? 0) + 1,
        hitCount: hits
      }
    })
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, limit)
}

function aggregateSeries(rows, field) {
  return summarizeSeries(rows.map((row) => Number(row[field] ?? 0)))
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, 'utf8')
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function buildCsvRows(entries, baselines) {
  return entries.map((entry) => {
    const baseline = entry.phase === 'current' ? baselines.get(`${entry.harness}:${entry.target}`) : null
    return {
      phase: entry.phase,
      commit: entry.commit,
      harness: entry.harness,
      target: entry.target,
      runs: entry.runs,
      warmup: entry.warmup,
      cpuUserMsP50: entry.cpuUserMs?.p50 ?? '',
      cpuUserMsP95: entry.cpuUserMs?.p95 ?? '',
      cpuUserMsMax: entry.cpuUserMs?.max ?? '',
      cpuSystemMsP50: entry.cpuSystemMs?.p50 ?? '',
      cpuSystemMsP95: entry.cpuSystemMs?.p95 ?? '',
      cpuSystemMsMax: entry.cpuSystemMs?.max ?? '',
      cpuTotalMsP50: entry.cpuTotalMs?.p50 ?? '',
      cpuTotalMsP95: entry.cpuTotalMs?.p95 ?? '',
      cpuTotalMsMax: entry.cpuTotalMs?.max ?? '',
      wallMsP50: entry.wallMs.p50,
      wallMsP95: entry.wallMs.p95,
      wallMsMax: entry.wallMs.max,
      resultSizeBytesP50: entry.resultSizeBytes.p50,
      resultSizeBytesP95: entry.resultSizeBytes.p95,
      resultSizeBytesMax: entry.resultSizeBytes.max,
      deltaCpuTotalP95Pct: baseline && entry.cpuTotalMs ? formatPct(computeDelta(entry.cpuTotalMs.p95, baseline.cpuTotalMs?.p95 ?? 0)) : '',
      deltaWallP95Pct: baseline ? formatPct(computeDelta(entry.wallMs.p95, baseline.wallMs.p95)) : '',
      deltaResultSizeP95Pct: baseline
        ? formatPct(computeDelta(entry.resultSizeBytes.p95, baseline.resultSizeBytes.p95))
        : '',
      rawJsonlPath: entry.rawJsonlPath,
      profilePath: entry.profilePath ?? ''
    }
  })
}

async function writeCsv(filePath, rows) {
  const headers = [
    'phase',
    'commit',
    'harness',
    'target',
    'runs',
    'warmup',
    'cpuUserMsP50',
    'cpuUserMsP95',
    'cpuUserMsMax',
    'cpuSystemMsP50',
    'cpuSystemMsP95',
    'cpuSystemMsMax',
    'cpuTotalMsP50',
    'cpuTotalMsP95',
    'cpuTotalMsMax',
    'wallMsP50',
    'wallMsP95',
    'wallMsMax',
    'resultSizeBytesP50',
    'resultSizeBytesP95',
    'resultSizeBytesMax',
    'deltaCpuTotalP95Pct',
    'deltaWallP95Pct',
    'deltaResultSizeP95Pct',
    'rawJsonlPath',
    'profilePath'
  ]
  const content = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n')
  await writeFile(filePath, `${content}\n`, 'utf8')
}

function formatHotspots(title, rows) {
  const body = rows
    .map((row, index) => `${index + 1}. \`${row.functionName}\` — ${row.hitCount} samples${row.url ? ` — \`${row.url}:${row.lineNumber}\`` : ''}`)
    .join('\n')
  return `### ${title}\n${body || '- 无数据'}`
}

function computeHotspotDiff(before, after) {
  const beforeNames = new Set(before.map((item) => item.functionName))
  const afterNames = new Set(after.map((item) => item.functionName))
  const disappeared = before.filter((item) => !afterNames.has(item.functionName)).map((item) => item.functionName)
  const added = after.filter((item) => !beforeNames.has(item.functionName)).map((item) => item.functionName)
  const dropped = after
    .filter((item) => beforeNames.has(item.functionName))
    .map((item) => {
      const baseline = before.find((entry) => entry.functionName === item.functionName)
      if (!baseline) return null
      return {
        functionName: item.functionName,
        deltaHits: item.hitCount - baseline.hitCount
      }
    })
    .filter((item) => item && item.deltaHits < 0)
    .sort((a, b) => a.deltaHits - b.deltaHits)

  return {
    disappeared,
    added,
    dropped
  }
}

async function writeMarkdownReport(filePath, context) {
  const lines = [
    '# SubTracker lite A→F 整体性能对比报告',
    '',
    '## 方法与口径',
    `- baseline commit: \`${context.baselineCommit}\``,
    `- current commit: \`${context.currentCommit}\``,
    `- 采样对象：lite Worker 后端（不含前端浏览器）`,
    `- fixture：\`${context.fixtureName}\``,
    `- target：${context.targets.map((item) => `\`${item}\``).join('、')}`,
    `- repeat=${context.repeat}，warmup=${context.warmup}`,
    `- Node harness 统计 per-target CPU/wall/result size；Worker HTTP harness 统计真实路由 wall/result size；whole-worker cpuprofile 仅用于热点归因。`,
    '',
    '## 环境与提交点',
    `- baseline snapshot: \`${context.phaseRoots.baseline}\``,
    `- current snapshot: \`${context.phaseRoots.current}\``,
    `- Worker 端口: \`${context.port}\``,
    `- Inspector 端口: \`${context.inspectorPort}\``,
    '',
    '## baseline/current 总表',
    '',
    '| harness | target | baseline p95 wall (ms) | current p95 wall (ms) | delta wall % | baseline p95 cpu (ms) | current p95 cpu (ms) | delta cpu % | baseline p95 size (bytes) | current p95 size (bytes) | delta size % |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  ]

  for (const pair of context.summaryPairs) {
    lines.push(
      `| ${pair.harness} | ${pair.target} | ${pair.baseline.wallMs.p95} | ${pair.current.wallMs.p95} | ${formatPct(
        computeDelta(pair.current.wallMs.p95, pair.baseline.wallMs.p95)
      )} | ${pair.baseline.cpuTotalMs?.p95 ?? ''} | ${pair.current.cpuTotalMs?.p95 ?? ''} | ${pair.current.cpuTotalMs ? formatPct(
        computeDelta(pair.current.cpuTotalMs.p95, pair.baseline.cpuTotalMs?.p95 ?? 0)
      ) : ''} | ${pair.baseline.resultSizeBytes.p95} | ${pair.current.resultSizeBytes.p95} | ${formatPct(
        computeDelta(pair.current.resultSizeBytes.p95, pair.baseline.resultSizeBytes.p95)
      )} |`
    )
  }

  lines.push(
    '',
    '## 热点排行',
    '',
    formatHotspots('baseline top 5', context.hotspots.baseline),
    '',
    formatHotspots('current top 5', context.hotspots.current),
    '',
    '### 热点变化',
    `- 消失热点：${context.hotspotDiff.disappeared.length ? context.hotspotDiff.disappeared.map((item) => `\`${item}\``).join('、') : '无'}`,
    `- 新增热点：${context.hotspotDiff.added.length ? context.hotspotDiff.added.map((item) => `\`${item}\``).join('、') : '无'}`,
    `- 明显下降热点：${
      context.hotspotDiff.dropped.length
        ? context.hotspotDiff.dropped.map((item) => `\`${item.functionName}\`(${item.deltaHits})`).join('、')
        : '无'
    }`,
    '',
    '## 关键结论',
    ...context.keyConclusions.map((item) => `- ${item}`),
    '',
    '## 补充说明 / 未纳入项',
    `- notification test/webhook：${context.notificationNote}`,
    '- 未输出 A/B/D/E/F 分段结论，只统计从 baseline 到 current 的整体收益。',
    `- 原始 JSONL 位于 \`${PERF_RESULT_DIR}\`，cpuprofile 位于 \`${PERF_PROFILE_DIR}\`。`
  )

  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function buildConclusions(summaryPairs) {
  const lines = []
  const workerPairs = summaryPairs.filter((item) => item.harness === WORKER_HARNESS)
  const nodePairs = summaryPairs.filter((item) => item.harness === NODE_HARNESS && item.current.cpuTotalMs && item.baseline.cpuTotalMs)

  const biggestWallWin = [...workerPairs].sort(
    (a, b) => computeDelta(a.current.wallMs.p95, a.baseline.wallMs.p95) - computeDelta(b.current.wallMs.p95, b.baseline.wallMs.p95)
  )[0]
  if (biggestWallWin) {
    lines.push(
      `${biggestWallWin.target} 的 Worker p95 wall 从 ${biggestWallWin.baseline.wallMs.p95}ms 降到 ${biggestWallWin.current.wallMs.p95}ms，变化 ${formatPct(
        computeDelta(biggestWallWin.current.wallMs.p95, biggestWallWin.baseline.wallMs.p95)
      )}% 。`
    )
  }

  const biggestCpuWin = [...nodePairs].sort(
    (a, b) =>
      computeDelta(a.current.cpuTotalMs.p95, a.baseline.cpuTotalMs.p95) -
      computeDelta(b.current.cpuTotalMs.p95, b.baseline.cpuTotalMs.p95)
  )[0]
  if (biggestCpuWin) {
    lines.push(
      `${biggestCpuWin.target} 的 Node p95 CPU 从 ${biggestCpuWin.baseline.cpuTotalMs.p95}ms 降到 ${biggestCpuWin.current.cpuTotalMs.p95}ms，变化 ${formatPct(
        computeDelta(biggestCpuWin.current.cpuTotalMs.p95, biggestCpuWin.baseline.cpuTotalMs.p95)
      )}% 。`
    )
  }

  const regressions = summaryPairs.filter((item) => computeDelta(item.current.wallMs.p95, item.baseline.wallMs.p95) > 0)
  if (regressions.length) {
    lines.push(
      `仍存在 ${regressions.length} 个 p95 wall 回归 target：${regressions
        .map((item) => `\`${item.harness}/${item.target}\`(${formatPct(computeDelta(item.current.wallMs.p95, item.baseline.wallMs.p95))}%)`)
        .join('、')}。`
    )
  } else {
    lines.push('主 workload 中所有 target 的 p95 wall 均未出现回归。')
  }

  return lines
}

async function main() {
  const args = parseArgs()
  const baselineCommit = String(args.baseline ?? DEFAULT_BASELINE_COMMIT)
  const currentCommit = String(args.current ?? DEFAULT_CURRENT_COMMIT)
  const subtrackerCommitMode = String(args['subtracker-commit-mode'] ?? 'append')
  const targets = splitTargets(args.target ?? DEFAULT_TARGETS.join(','))
  const subscriptions = Number.parseInt(String(args.subscriptions ?? DEFAULTS.subscriptions), 10)
  const tags = Number.parseInt(String(args.tags ?? DEFAULTS.tags), 10)
  const paymentsPerSubscription = Number.parseInt(
    String(args['payments-per-subscription'] ?? DEFAULTS.paymentsPerSubscription),
    10
  )
  const repeat = Number.parseInt(String(args.repeat ?? DEFAULTS.repeat), 10)
  const warmup = Number.parseInt(String(args.warmup ?? DEFAULTS.warmup), 10)
  const mode = String(args.mode ?? DEFAULTS.mode)
  const port = Number.parseInt(String(args.port ?? DEFAULT_PORT), 10)
  const inspectorPort = Number.parseInt(String(args['inspector-port'] ?? DEFAULT_INSPECTOR_PORT), 10)
  const allowDirtyCurrent = String(args['allow-dirty-current'] ?? 'false') === 'true'

  const fixtureOptions = {
    subscriptions,
    tags,
    paymentsPerSubscription,
    mode
  }
  const fixtureName = fixtureLabel({
    subscriptions,
    tags,
    paymentsPerSubscription,
    mode,
    channelMode: DEFAULTS.channelMode
  })

  const baselineRoot = path.join(PERF_ROOT, 'be70f8d-worker-baseline-wt')
  const currentRoot = REPO_ROOT
  const reportDir = String(args['report-dir'] ?? PERF_REPORT_DIR)

  await ensurePerfDirs()
  await mkdir(reportDir, { recursive: true })
  await prepareCurrentSnapshot(currentRoot, currentCommit, allowDirtyCurrent)

  for (const phaseRoot of [baselineRoot]) {
    await copyMeasurementScripts(phaseRoot)
    await ensurePhaseNodeEnv(phaseRoot)
  }

  await ensureCurrentDirtyStateIsToolOnly(currentCommit, allowDirtyCurrent)

  for (const phaseRoot of [baselineRoot, currentRoot]) {
    const wrangler = await prepareWranglerEnv(phaseRoot)
    await ensurePhaseBuild(phaseRoot, wrangler.env)
  }

  const artifacts = []
  const phaseRoots = {
    baseline: baselineRoot,
    current: currentRoot
  }

  await cleanupPort(port)
  await cleanupPort(inspectorPort)
  await cleanupWorkerd()

  for (const phase of [
    { phase: 'baseline', commit: baselineCommit, root: baselineRoot },
    { phase: 'current', commit: currentCommit, root: currentRoot }
  ]) {
    const wrangler = await prepareWranglerEnv(phase.root)
    const runtimeResultsDir = path.join(PERF_RESULT_DIR, phase.phase)
    const runtimeProfilesDir = path.join(PERF_PROFILE_DIR, phase.phase)
    await Promise.all([mkdir(runtimeResultsDir, { recursive: true }), mkdir(runtimeProfilesDir, { recursive: true })])

    await cleanupPort(port)
    await cleanupPort(inspectorPort)
    await cleanupWorkerd()

    const worker = await startWorker(phase.root, wrangler.env, {
      phase: phase.phase,
      port,
      inspectorPort
    })

    try {
      const baseUrl = `http://127.0.0.1:${port}`
      await runNodeSeed(phase.root, wrangler.env, fixtureOptions)
      await verifyPhase(baseUrl)
      await runWorkerSeed(phase.root, wrangler.env, fixtureOptions, baseUrl, worker.persistRoot)
      await verifyPhase(baseUrl)

      const nodeResultPath = path.join(runtimeResultsDir, `${fixtureName}-${phase.phase}-${NODE_HARNESS}.jsonl`)
      const workerResultPath = path.join(runtimeResultsDir, `${fixtureName}-${phase.phase}-${WORKER_HARNESS}.jsonl`)
      const nodeProfileDir = path.join(runtimeProfilesDir, 'node-harness')
      const workerProfilePath = path.join(
        PERF_PROFILE_DIR,
        `${phase.phase === 'baseline' ? 'baseline' : 'current'}-worker.cpuprofile`
      )
      const overviewProbePath = path.join(runtimeResultsDir, `${fixtureName}-${phase.phase}-overview-response.json`)
      await Promise.all([
        removeIfExists(nodeResultPath),
        removeIfExists(nodeResultPath.replace(/\.jsonl$/, '.meta.jsonl')),
        removeIfExists(workerResultPath),
        removeIfExists(overviewProbePath),
        removeIfExists(workerProfilePath)
      ])

      const nodeTargets = targets.filter(shouldRunNodeTarget)
      if (nodeTargets.length > 0) {
        await runNodeHarnessInBatches(
          phase.root,
          wrangler.env,
          fixtureOptions,
          nodeTargets,
          nodeResultPath,
          nodeProfileDir,
          `${phase.phase}-${fixtureName}`,
          warmup,
          repeat,
          subtrackerCommitMode
        )
      }

      const workerTargets = targets.filter(shouldRunWorkerTarget)
      if (workerTargets.length > 0) {
        await withInspectorProfile(
          inspectorPort,
          async () => {
            await runWorkerHarnessInBatches(
              phase.root,
              wrangler.env,
              fixtureOptions,
              workerTargets,
              baseUrl,
              repeat,
              warmup,
              workerResultPath,
              subtrackerCommitMode
            )
          },
          workerProfilePath
        )
        await verifyCpuprofile(workerProfilePath)
      }
      if (workerTargets.includes('overview')) {
        const overviewPayload = await fetchOverviewPayload(baseUrl)
        await writeFile(overviewProbePath, `${JSON.stringify(overviewPayload, null, 2)}\n`, 'utf8')
      }

      artifacts.push({
        phase: phase.phase,
        commit: phase.commit,
        root: phase.root,
        nodeResultPath,
        workerResultPath,
        workerProfilePath,
        nodeProfileDir,
        overviewProbePath
      })
    } finally {
      await stopWorker(worker)
      await cleanupWorkerd()
      await cleanupPort(port)
      await cleanupPort(inspectorPort)
    }
  }

  const allEntries = []
  for (const artifact of artifacts) {
    const nodeRows = await pathExists(artifact.nodeResultPath) ? await readJsonl(artifact.nodeResultPath) : []
    const workerRows = await pathExists(artifact.workerResultPath) ? await readJsonl(artifact.workerResultPath) : []

    for (const target of targets) {
      const nodeTargetRows = nodeRows.filter((row) => row.target === target)
      const workerTargetRows = workerRows.filter((row) => row.target === target)

      if (nodeTargetRows.length) {
        const profilePath = path.join(artifact.nodeProfileDir, `${artifact.phase}-${fixtureName}-${target}.cpuprofile`)
        allEntries.push({
          phase: artifact.phase,
          commit: artifact.commit,
          harness: NODE_HARNESS,
          target,
          runs: nodeTargetRows.length,
          warmup,
          cpuUserMs: aggregateSeries(nodeTargetRows, 'cpuUserMs'),
          cpuSystemMs: aggregateSeries(nodeTargetRows, 'cpuSystemMs'),
          cpuTotalMs: aggregateSeries(nodeTargetRows, 'cpuTotalMs'),
          wallMs: aggregateSeries(nodeTargetRows, 'wallMs'),
          resultSizeBytes: aggregateSeries(nodeTargetRows, 'resultSizeBytes'),
          rawJsonlPath: artifact.nodeResultPath,
          profilePath
        })
      }

      if (workerTargetRows.length) {
        allEntries.push({
          phase: artifact.phase,
          commit: artifact.commit,
          harness: WORKER_HARNESS,
          target,
          runs: workerTargetRows.length,
          warmup,
          cpuUserMs: null,
          cpuSystemMs: null,
          cpuTotalMs: null,
          wallMs: aggregateSeries(workerTargetRows, 'wallMs'),
          resultSizeBytes: aggregateSeries(workerTargetRows, 'resultSizeBytes'),
          rawJsonlPath: artifact.workerResultPath,
          profilePath: artifact.workerProfilePath
        })
      }
    }
  }

  const baselineMap = new Map(
    allEntries.filter((entry) => entry.phase === 'baseline').map((entry) => [`${entry.harness}:${entry.target}`, entry])
  )
  const csvRows = await buildCsvRows(allEntries, baselineMap)
  await writeCsv(path.join(reportDir, 'report.csv'), csvRows)

  const summaryPairs = targets.flatMap((target) => {
    return [NODE_HARNESS, WORKER_HARNESS]
      .map((harness) => {
        const baseline = allEntries.find((entry) => entry.phase === 'baseline' && entry.harness === harness && entry.target === target)
        const current = allEntries.find((entry) => entry.phase === 'current' && entry.harness === harness && entry.target === target)
        if (!baseline || !current) return null
        return { harness, target, baseline, current }
      })
      .filter(Boolean)
  })

  const baselineWorkerProfilePath = path.join(PERF_PROFILE_DIR, 'baseline-worker.cpuprofile')
  const currentWorkerProfilePath = path.join(PERF_PROFILE_DIR, 'current-worker.cpuprofile')
  const workerProfileAvailable = targets.some(shouldRunWorkerTarget)
  const hotspots = workerProfileAvailable
    ? {
        baseline: await collectProfileTopFrames(baselineWorkerProfilePath),
        current: await collectProfileTopFrames(currentWorkerProfilePath)
      }
    : {
        baseline: [],
        current: []
      }
  const hotspotDiff = computeHotspotDiff(hotspots.baseline, hotspots.current)
  const keyConclusions = buildConclusions(summaryPairs)

  await writeMarkdownReport(path.join(reportDir, 'report.md'), {
    baselineCommit,
    currentCommit,
    fixtureName,
    targets,
    repeat,
    warmup,
    phaseRoots,
    port,
    inspectorPort,
    summaryPairs,
    hotspots,
    hotspotDiff,
    keyConclusions,
    notificationNote: '未纳入主 workload；本轮只执行 overview / scan-debug / import / subscription detail/payment-records 固定口径。',
    baselineProfile: baselineWorkerProfilePath,
    currentProfile: currentWorkerProfilePath
  })

  await cleanupWorkerd()
  await cleanupPort(port)
  await cleanupPort(inspectorPort)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
