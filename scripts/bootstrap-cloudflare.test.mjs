import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attachExistingResources,
  bindingResourceName,
  getInventoryCommands,
  resolveAppVersion,
  resolveWorkerName,
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
      packageVersion: '0.0.1'
    }),
    'v1.2.3'
  )
  assert.equal(
    resolveAppVersion({
      cliArgs: [],
      env: { VITE_APP_VERSION: 'v9.9.9' },
      packageVersion: '0.0.1'
    }),
    'v9.9.9'
  )
  assert.equal(
    resolveAppVersion({
      cliArgs: [],
      env: {},
      packageVersion: '0.0.1'
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
