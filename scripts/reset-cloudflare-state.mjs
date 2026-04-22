import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const cwd = process.cwd()
const args = new Set(process.argv.slice(2))

const command = args.has('--local-rates')
  ? 'local-rates'
  : args.has('--local-kv')
    ? 'local-kv'
    : args.has('--local-d1')
      ? 'local-d1'
      : 'local-all'

function run(bin, binArgs) {
  return new Promise((resolve, reject) => {
    const resolvedBin = process.platform === 'win32' && bin === 'npx' ? 'npx.cmd' : bin
    const child = spawn(resolvedBin, binArgs, {
      cwd,
      stdio: 'inherit',
      shell: false
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${resolvedBin} ${binArgs.join(' ')} exited with code ${code ?? 1}`))
    })
  })
}

async function removeIfExists(relativePath) {
  await rm(path.resolve(cwd, relativePath), {
    recursive: true,
    force: true
  })
}

async function execD1(mode, sql) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'subtracker-d1-reset-'))
  const sqlFile = path.join(tempDir, 'reset.sql')

  try {
    await writeFile(sqlFile, sql, 'utf8')
    await run('npx', ['wrangler', 'd1', 'execute', 'DB', `--${mode}`, '--file', sqlFile])
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true
    })
  }
}

async function main() {
  switch (command) {
    case 'local-all':
      await removeIfExists('.wrangler/state/v3')
      console.log('[reset-worker] 已重置本地 Wrangler state（D1/KV/Cache）')
      return
    case 'local-d1':
      await removeIfExists('.wrangler/state/v3/d1')
      console.log('[reset-worker] 已重置本地 D1')
      return
    case 'local-kv':
      await removeIfExists('.wrangler/state/v3/kv')
      console.log('[reset-worker] 已重置本地 KV')
      return
    case 'local-rates':
      await execD1('local', 'DELETE FROM "ExchangeRateSnapshot";')
      console.log('[reset-worker] 已清空本地汇率快照')
      return
    default:
      throw new Error(`Unsupported reset command: ${command}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
