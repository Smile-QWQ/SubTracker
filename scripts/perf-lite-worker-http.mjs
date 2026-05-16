import { performance } from 'node:perf_hooks'
import {
  DEFAULTS,
  PERF_RESULT_DIR,
  appendJsonl,
  ensurePerfDirs,
  fixtureLabel,
  fixturePath,
  nowStamp,
  parseArgs,
  readJson,
  summarizeSeries,
  toInt
} from './perf-lite-common.mjs'

function formatTable(rows) {
  const headers = ['target', 'p50_wall', 'p95_wall', 'max_wall', 'result_kb']
  const matrix = [
    headers,
    ...rows.map((row) => [
      row.target,
      `${row.wall.p50}ms`,
      `${row.wall.p95}ms`,
      `${row.wall.max}ms`,
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

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin'
    })
  })
  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`)
  }
  const payload = await response.json()
  return payload.data.token
}

async function requestTarget(baseUrl, token, target, importPayload, wallosImportPayload, protocols) {
  if (target === 'login') {
    return loginPayload(baseUrl)
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
  if (process.env.SUBTRACKER_PERF_TRACE === '1') {
    headers['x-subtracker-perf-trace'] = '1'
  }

  switch (target) {
    case 'overview': {
      const response = await fetch(`${baseUrl}/api/v1/statistics/overview`, { headers })
      return response.json()
    }
    case 'scan-debug': {
      const response = await fetch(`${baseUrl}/api/v1/notifications/scan-debug`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          now: '2026-05-01T10:15:00+08:00',
          dryRun: true
        })
      })
      return response.json()
    }
    case 'import-inspect': {
      const response = await fetch(`${baseUrl}/api/v1/import/subtracker/inspect`, {
        method: 'POST',
        headers,
        body: JSON.stringify(importPayload)
      })
      return response.json()
    }
    case 'import-commit': {
      const response = await fetch(`${baseUrl}/api/v1/import/subtracker/commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(await buildSubtrackerCommitBody(baseUrl, headers, importPayload, protocols.subtracker))
      })
      return response.json()
    }
    case 'wallos-import-inspect': {
      const response = await fetch(`${baseUrl}/api/v1/import/wallos/inspect`, {
        method: 'POST',
        headers,
        body: JSON.stringify(wallosImportPayload)
      })
      return response.json()
    }
    case 'wallos-import-commit': {
      const response = await fetch(`${baseUrl}/api/v1/import/wallos/commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(await buildWallosCommitBody(baseUrl, headers, wallosImportPayload, protocols.wallos))
      })
      return response.json()
    }
    case 'subscription-detail': {
      const response = await fetch(`${baseUrl}/api/v1/subscriptions/${importPayload.subscriptionId}`, { headers })
      return response.json()
    }
    case 'subscription-payment-records': {
      const response = await fetch(`${baseUrl}/api/v1/subscriptions/${importPayload.subscriptionId}/payment-records`, {
        headers
      })
      return response.json()
    }
    default:
      throw new Error(`Unsupported worker target: ${target}`)
  }
}

async function loginPayload(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin'
    })
  })
  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`)
  }
  return response.json()
}

async function buildSubtrackerCommitBody(baseUrl, headers, importPayload, protocol) {
  const commitMode = String(importPayload.commitMode ?? 'append')
  if (protocol === 'direct') {
    return {
      manifest: importPayload.manifest,
      logoAssets: importPayload.logoAssets,
      mode: commitMode,
      restoreSettings: false
    }
  }

  const inspectResponse = await fetch(`${baseUrl}/api/v1/import/subtracker/inspect`, {
    method: 'POST',
    headers,
    body: JSON.stringify(importPayload)
  })
  const inspectResult = await inspectResponse.json()
  const importToken = inspectResult?.data?.importToken

  if (protocol === 'token') {
    if (typeof importToken !== 'string') {
      throw new Error('Expected token-based SubTracker import protocol, but inspect returned no importToken')
    }
    return {
      importToken,
      mode: commitMode,
      restoreSettings: false
    }
  }

  return typeof importToken === 'string'
    ? {
        importToken,
        mode: commitMode,
        restoreSettings: false
      }
    : {
        manifest: importPayload.manifest,
        logoAssets: importPayload.logoAssets,
        mode: commitMode,
        restoreSettings: false
      }
}

async function buildWallosCommitBody(baseUrl, headers, wallosImportPayload, protocol) {
  if (protocol === 'direct') {
    return {
      fileType: wallosImportPayload.fileType,
      preview: wallosImportPayload.preview,
      logoAssets: wallosImportPayload.logoAssets
    }
  }

  const inspectResponse = await fetch(`${baseUrl}/api/v1/import/wallos/inspect`, {
    method: 'POST',
    headers,
    body: JSON.stringify(wallosImportPayload)
  })
  const inspectResult = await inspectResponse.json()
  const importToken = inspectResult?.data?.importToken

  if (protocol === 'token') {
    if (typeof importToken !== 'string') {
      throw new Error('Expected token-based Wallos import protocol, but inspect returned no importToken')
    }
    return {
      importToken,
      preview: wallosImportPayload.preview
    }
  }

  return typeof importToken === 'string'
    ? {
        importToken,
        preview: wallosImportPayload.preview
      }
    : {
        fileType: wallosImportPayload.fileType,
        preview: wallosImportPayload.preview,
        logoAssets: wallosImportPayload.logoAssets
      }
}

async function main() {
  const args = parseArgs()
  const baseUrl = String(args['base-url'] ?? 'http://127.0.0.1:8787')
  const protocols = {
    subtracker: String(args['subtracker-commit-protocol'] ?? 'auto'),
    wallos: String(args['wallos-commit-protocol'] ?? 'auto')
  }
  const subtrackerCommitMode = String(args['subtracker-commit-mode'] ?? 'append')
  const targets = String(args.target ?? 'overview,scan-debug')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const repeat = toInt(args.repeat, DEFAULTS.repeat)
  const warmup = toInt(args.warmup, 0)
  const fixtureMeta = {
    subscriptions: toInt(args.subscriptions, DEFAULTS.subscriptions),
    tags: toInt(args.tags, DEFAULTS.tags),
    paymentsPerSubscription: toInt(args['payments-per-subscription'], DEFAULTS.paymentsPerSubscription),
    mode: String(args.mode ?? DEFAULTS.mode)
  }

  await ensurePerfDirs()
  const fixture = await readJson(fixturePath(fixtureMeta))
  const subscriptionId = fixture.dataset.subscriptions[0]?.id ?? 'perf_sub_1'
  const importPayload = {
    filename: `${fixtureLabel(fixtureMeta)}.zip`,
    manifest: fixture.dataset.manifest,
    logoAssets: fixture.dataset.logoAssets,
    subscriptionId,
    commitMode: subtrackerCommitMode
  }
  const wallosImportPayload = {
    filename: `${fixtureLabel(fixtureMeta)}-wallos.zip`,
    fileType: fixture.dataset.wallosPreparedPayload.fileType,
    preview: fixture.dataset.wallosPreparedPayload.preview,
    logoAssets: fixture.dataset.wallosPreparedPayload.logoAssets
  }
  const token = targets.every((target) => target === 'login') ? null : await login(baseUrl)
  const resultPath = String(args['result-path'] ?? `${PERF_RESULT_DIR}\\${fixtureLabel(fixtureMeta)}-worker-${nowStamp()}.jsonl`)
  const summaryRows = []

  for (const target of targets) {
    const wallValues = []
    const resultSizeValues = []

    for (let index = 0; index < warmup + repeat; index += 1) {
      const startedAt = performance.now()
      const result = await requestTarget(baseUrl, token, target, importPayload, wallosImportPayload, protocols)
      const wallMs = performance.now() - startedAt
      const resultSizeBytes = Buffer.byteLength(JSON.stringify(result))
      if (index >= warmup) {
        wallValues.push(wallMs)
        resultSizeValues.push(resultSizeBytes)

        await appendJsonl(resultPath, {
          target,
          dataset: fixtureLabel(fixtureMeta),
          iteration: index - warmup + 1,
          wallMs: Number(wallMs.toFixed(2)),
          resultSizeBytes,
          status: result?.error ? 'failed' : 'ok'
        })
      }
    }

    summaryRows.push({
      target,
      wall: summarizeSeries(wallValues),
      resultKb: Number((summarizeSeries(resultSizeValues).p95 / 1024).toFixed(2))
    })
  }

  console.log(formatTable(summaryRows))
  console.log(
    JSON.stringify({
      ok: true,
      baseUrl,
      fixture: fixtureLabel(fixtureMeta),
      resultPath,
      targets
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

export { login, loginPayload, requestTarget }
