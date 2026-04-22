import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const cwd = process.cwd()
const cliArgs = process.argv.slice(2)
const args = new Set(cliArgs)
const withR2 = args.has('--with-r2')
const skipBuild = args.has('--skip-build')
const configPath = path.resolve(cwd, 'wrangler.jsonc')
const generatedConfigPath = path.resolve(cwd, '.wrangler.generated.jsonc')

function bindingResourceName(workerName, binding) {
  const suffixMap = {
    DB: 'db',
    SUBTRACKER_CACHE: 'cache',
    SUBTRACKER_LOGOS: 'logos'
  }

  const suffix = suffixMap[binding] || binding.toLowerCase().replace(/^subtracker_/, '').replace(/_/g, '-')
  return `${workerName}-${suffix}`
}

function withProvisionedR2Binding(config) {
  return {
    ...config,
    r2_buckets: [
      {
        binding: 'SUBTRACKER_LOGOS',
        bucket_name: bindingResourceName(config.name, 'SUBTRACKER_LOGOS')
      }
    ]
  }
}

function readFlagValue(cliArgs, flagName) {
  const index = cliArgs.indexOf(flagName)
  if (index === -1) return ''
  return cliArgs[index + 1]?.trim() || ''
}

function resolveAppVersion({
  cliArgs = [],
  env = process.env,
  packageVersion = '0.0.1',
  gitSha = ''
}) {
  const cliValue = readFlagValue(cliArgs, '--app-version')
  return cliValue || env.VITE_APP_VERSION?.trim() || env.APP_VERSION?.trim() || gitSha || packageVersion
}

function sanitizeWorkerName(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveWorkerName({
  defaultName,
  cliArgs = [],
  env = process.env
}) {
  const cliValue = readFlagValue(cliArgs, '--name-prefix')
  const envValue = env.CLOUDFLARE_WORKER_PREFIX?.trim() || env.WORKER_NAME_PREFIX?.trim() || ''
  const normalized = sanitizeWorkerName(cliValue || envValue || 'subtracker')
  return normalized || defaultName
}

function attachExistingResources(config, inventory) {
  for (const namespace of config.kv_namespaces ?? []) {
    if (namespace.id) continue
    const expectedTitle = bindingResourceName(config.name, namespace.binding)
    const found = inventory.kv.find((item) => item.title === expectedTitle)
    if (!found) continue
    namespace.id = found.id
    namespace.preview_id = namespace.preview_id || found.id
  }

  for (const database of config.d1_databases ?? []) {
    if (database.database_id) continue
    const expectedName = bindingResourceName(config.name, database.binding)
    const found = inventory.d1.find((item) => item.name === expectedName)
    if (!found) continue
    database.database_id = found.uuid
    database.database_name = database.database_name || found.name
  }
  return config
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const stdoutChunks = []
    const stderrChunks = []
    const child = spawn(command, commandArgs, {
      cwd,
      env: {
        ...process.env,
        ...(options.env ?? {})
      },
      stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      shell: process.platform === 'win32'
    })

    if (options.captureOutput) {
      child.stdout?.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)))
      child.stderr?.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)))
    }

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8')
        })
        return
      }

      reject(
        new Error(
          `${command} ${commandArgs.join(' ')} exited with code ${code ?? 1}${
            stderrChunks.length ? `\n${Buffer.concat(stderrChunks).toString('utf8')}` : ''
          }`
        )
      )
    })
  })
}

async function runJson(command, commandArgs) {
  const { stdout } = await run(command, commandArgs, { captureOutput: true })
  const normalized = stdout.trim()
  return JSON.parse(normalized || '[]')
}

function getInventoryCommands() {
  return {
    kv: ['npx', ['wrangler', 'kv', 'namespace', 'list']],
    d1: ['npx', ['wrangler', 'd1', 'list', '--json']]
  }
}

async function discoverExistingResources() {
  const commands = getInventoryCommands()
  const [kv, d1] = await Promise.all([
    runJson(...commands.kv),
    runJson(...commands.d1)
  ])

  return {
    kv,
    d1,
    r2: []
  }
}

async function ensureR2Bucket(config) {
  for (const bucket of config.r2_buckets ?? []) {
    try {
      await run('npx', [
        'wrangler',
        'r2',
        'bucket',
        'create',
        bucket.bucket_name,
        '--config',
        generatedConfigPath,
        '--update-config=false'
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/already exists/i.test(message)) {
        continue
      }
      throw error
    }
  }
}

async function buildGeneratedConfig() {
  const raw = await readFile(configPath, 'utf8')
  let config = JSON.parse(raw)
  const packageJson = JSON.parse(await readFile(path.resolve(cwd, 'package.json'), 'utf8'))
  const gitSha = (await run('git', ['rev-parse', '--short', 'HEAD'], { captureOutput: true })).stdout.trim()
  config.name = resolveWorkerName({
    defaultName: config.name || 'subtracker',
    cliArgs
  })
  config.vars = {
    ...(config.vars ?? {}),
    APP_VERSION: resolveAppVersion({
      cliArgs,
      packageVersion: packageJson.version || '0.0.1',
      gitSha
    })
  }

  if (withR2) {
    config = withProvisionedR2Binding(config)
  } else {
    delete config.r2_buckets
  }

  const inventory = await discoverExistingResources()
  attachExistingResources(config, inventory)

  await writeFile(generatedConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

async function main() {
  await buildGeneratedConfig()

  try {
    if (withR2) {
      const raw = await readFile(generatedConfigPath, 'utf8')
      const generatedConfig = JSON.parse(raw)
      await ensureR2Bucket(generatedConfig)
    }

    if (!skipBuild) {
      await run('npm', ['run', 'build:web'], {
        env: {
          VITE_APP_VERSION: generatedConfig.vars?.APP_VERSION || process.env.VITE_APP_VERSION || '0.0.1'
        }
      })
    }

    await run('npx', ['wrangler', 'deploy', '--config', generatedConfigPath])
  } finally {
    await rm(generatedConfigPath, { force: true })
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

export { attachExistingResources, bindingResourceName, getInventoryCommands }
export { resolveAppVersion, resolveWorkerName, withProvisionedR2Binding }
