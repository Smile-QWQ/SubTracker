import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const cwd = process.cwd()
const args = new Set(process.argv.slice(2))

const command = args.has('--remote-all')
  ? 'remote-all'
  : args.has('--remote-rates')
    ? 'remote-rates'
    : args.has('--local-rates')
      ? 'local-rates'
      : args.has('--local-kv')
        ? 'local-kv'
      : args.has('--local-d1')
        ? 'local-d1'
        : 'local-all'

function run(bin, binArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, binArgs, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${bin} ${binArgs.join(' ')} exited with code ${code ?? 1}`))
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
  await run('npx', ['wrangler', 'd1', 'execute', 'DB', `--${mode}`, '--command', sql])
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
    case 'remote-rates':
      await execD1('remote', 'DELETE FROM "ExchangeRateSnapshot";')
      console.log('[reset-worker] 已清空远端汇率快照')
      return
    case 'remote-all':
      await execD1(
        'remote',
        'DROP TABLE IF EXISTS "PaymentRecord"; DROP TABLE IF EXISTS "SubscriptionTag"; DROP TABLE IF EXISTS "WebhookDelivery"; DROP TABLE IF EXISTS "Subscription"; DROP TABLE IF EXISTS "Tag"; DROP TABLE IF EXISTS "ExchangeRateSnapshot"; DROP TABLE IF EXISTS "Setting";'
      )
      console.log('[reset-worker] 已清空远端 D1 业务表；下次请求会自动重建表结构')
      return
    default:
      throw new Error(`Unsupported reset command: ${command}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
