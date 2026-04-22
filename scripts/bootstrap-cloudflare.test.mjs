import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyOptionalBindings,
  attachExistingResources,
  bindingResourceName,
  canUseInteractiveWranglerLogin,
  getInventoryCommands,
  isWranglerAuthError,
  resolveAppVersion,
  resolveWorkerName,
  syncCronTriggers,
  withProvisionedR2Binding
} from './bootstrap-cloudflare.mjs'

test('bindingResourceName uses worker-prefixed kebab-case names', () => {
  assert.equal(bindingResourceName('subtracker', 'SUBTRACKER_CACHE'), 'subtracker-cache')
  assert.equal(bindingResourceName('subtracker', 'DB'), 'subtracker-db')
  assert.equal(bindingResourceName('subtracker', 'SUBTRACKER_LOGOS'), 'subtracker-logos')
})

test('resolveWorkerName defaults to subtracker and supports overrides', () => {
  assert.equal(resolveWorkerName({ defaultName: 'subtracker-lite', cliArgs: [] }), 'subtracker')
  assert.equal(resolveWorkerName({ defaultName: 'subtracker-lite', cliArgs: ['--name-prefix', 'demo'] }), 'demo')
  assert.equal(resolveWorkerName({ defaultName: 'subtracker-lite', cliArgs: [], env: { CLOUDFLARE_WORKER_PREFIX: 'edge' } }), 'edge')
})

test('resolveAppVersion prefers explicit app version and falls back to package version', () => {
  assert.equal(
    resolveAppVersion({
      cliArgs: ['--app-version', 'v1.2.3'],
      env: {},
      packageVersion: '0.0.1',
      gitSha: 'abc1234'
    }),
    'v1.2.3'
  )
  assert.equal(
    resolveAppVersion({
      cliArgs: [],
      env: { VITE_APP_VERSION: 'v9.9.9' },
      packageVersion: '0.0.1',
      gitSha: 'abc1234'
    }),
    'v9.9.9'
  )
  assert.equal(
    resolveAppVersion({
      cliArgs: [],
      env: {},
      packageVersion: '0.0.1',
      gitSha: 'abc1234'
    }),
    'abc1234'
  )
  assert.equal(
    resolveAppVersion({
      cliArgs: [],
      env: {},
      packageVersion: '0.0.1',
      gitSha: ''
    }),
    '0.0.1'
  )
})

test('attachExistingResources reuses existing kv, d1 and r2 resources', () => {
  const config = {
    name: 'subtracker',
    kv_namespaces: [{ binding: 'SUBTRACKER_CACHE' }],
    d1_databases: [{ binding: 'DB' }],
    r2_buckets: [{ binding: 'SUBTRACKER_LOGOS', bucket_name: 'subtracker-logos' }]
  }

  const next = attachExistingResources(config, {
    kv: [{ title: 'subtracker-cache', id: 'kv-123' }],
    d1: [{ name: 'subtracker-db', uuid: 'd1-123' }],
    r2: []
  })

  assert.equal(next.kv_namespaces[0].id, 'kv-123')
  assert.equal(next.kv_namespaces[0].preview_id, 'kv-123')
  assert.equal(next.d1_databases[0].database_id, 'd1-123')
  assert.equal(next.d1_databases[0].database_name, 'subtracker-db')
  assert.equal(next.r2_buckets[0].bucket_name, 'subtracker-logos')
})

test('attachExistingResources leaves missing resources unresolved for auto provisioning', () => {
  const config = {
    name: 'subtracker',
    kv_namespaces: [{ binding: 'SUBTRACKER_CACHE' }],
    d1_databases: [{ binding: 'DB' }]
  }

  const next = attachExistingResources(config, {
    kv: [],
    d1: [],
    r2: []
  })

  assert.equal(next.kv_namespaces[0].id, undefined)
  assert.equal(next.d1_databases[0].database_id, undefined)
})

test('getInventoryCommands matches wrangler 4 command capabilities', () => {
  const commands = getInventoryCommands()
  assert.deepEqual(commands.kv, ['npx', ['wrangler', 'kv', 'namespace', 'list']])
  assert.deepEqual(commands.d1, ['npx', ['wrangler', 'd1', 'list', '--json']])
})

test('getInventoryCommands can skip kv inventory when kv is disabled', () => {
  const commands = getInventoryCommands({ includeKv: false })
  assert.equal(commands.kv, undefined)
  assert.deepEqual(commands.d1, ['npx', ['wrangler', 'd1', 'list', '--json']])
})

test('interactive wrangler login is only allowed for local deploy without api token', () => {
  assert.equal(canUseInteractiveWranglerLogin({}), true)
  assert.equal(canUseInteractiveWranglerLogin({ CLOUDFLARE_API_TOKEN: 'token' }), false)
  assert.equal(canUseInteractiveWranglerLogin({ CI: 'true' }), false)
})

test('isWranglerAuthError detects missing-token style wrangler failures', () => {
  assert.equal(isWranglerAuthError(new Error('Failed to fetch auth token: 400 Bad Request')), true)
  assert.equal(
    isWranglerAuthError(
      new Error("In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable")
    ),
    true
  )
  assert.equal(isWranglerAuthError(new Error('random failure')), false)
})

test('withProvisionedR2Binding sets deterministic bucket name', () => {
  const config = withProvisionedR2Binding({
    name: 'subtracker'
  })

  assert.deepEqual(config.r2_buckets, [
    {
      binding: 'SUBTRACKER_LOGOS',
      bucket_name: 'subtracker-logos'
    }
  ])
})

test('applyOptionalBindings can disable kv while preserving d1', () => {
  const config = applyOptionalBindings(
    {
      kv_namespaces: [{ binding: 'SUBTRACKER_CACHE' }],
      d1_databases: [{ binding: 'DB' }]
    },
    {
      enableKv: false,
      enableR2: false
    }
  )

  assert.equal(config.kv_namespaces, undefined)
  assert.deepEqual(config.d1_databases, [{ binding: 'DB' }])
})

test('syncCronTriggers mirrors worker cron vars into deployed triggers', () => {
  const config = syncCronTriggers({
    vars: {
      CRON_SCAN: '*/5 * * * *',
      CRON_AUTO_RENEW: '2 * * * *',
      CRON_RECONCILE_EXPIRED: '10 2 * * *',
      CRON_REFRESH_RATES: '0 2 * * *'
    }
  })

  assert.deepEqual(config.triggers.crons, ['*/5 * * * *', '2 * * * *', '0 2 * * *', '10 2 * * *'])
})
