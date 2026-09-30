import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'

const mocks = vi.hoisted(() => ({ verify: vi.fn(), prepare: vi.fn() }))
vi.mock('../../src/services/auth.service', () => ({ verifyToken: mocks.verify }))
vi.mock('../../src/db', () => ({ prisma: {} }))
vi.mock('../../src/services/settings.service', async original => ({
  ...await original<typeof import('../../src/services/settings.service')>(),
  getResolvedAppLocale: async () => 'en-US'
}))
vi.mock('../../src/services/subtracker-backup.service', async original => ({
  ...await original<typeof import('../../src/services/subtracker-backup.service')>(),
  prepareSubtrackerBackupArchive: mocks.prepare
}))

import { buildApp } from '../../src/app'
import { clearBackupDownloads } from '../../src/services/backup-download.service'

describe('one-use backup download authorization', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let directory: string
  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'backup-download-test-'))
    vi.stubEnv('BACKUP_TEMP_DIR', directory)
    app = await buildApp()
    await app.ready()
  })
  beforeEach(() => {
    clearBackupDownloads()
    mocks.verify.mockReset().mockImplementation(async token => token === 'session' ? { username: 'admin', mustChangePassword: false } : null)
    mocks.prepare.mockReset().mockResolvedValue({ filename: 'backup.zip', contentType: 'application/zip', openStream: () => Readable.from(Buffer.from('ZIP')) })
  })
  afterAll(async () => { await app.close(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }) })
  const headers = { authorization: 'Bearer session' }
  async function ticket() {
    const res = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers, payload: { includeSubscriptionImages: false } })
    expect(res.statusCode).toBe(200)
    expect(mocks.prepare).toHaveBeenCalledWith(false, 'standard', [])
    return res.json().data.token as string
  }

  it('passes the requested legacy format to archive preparation', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers,
      payload: { format: 'legacy-v0.11', includeSubscriptionImages: true } })
    expect(res.statusCode).toBe(200)
    expect(mocks.prepare).toHaveBeenCalledWith(true, 'legacy-v0.11', [])
  })

  it('returns missing assets without allocating tickets and forwards explicit consent', async () => {
    const { BackupMissingAssetsError } = await import('../../src/services/subtracker-backup.service')
    const assets = [{ kind: 'logo' as const, path: 'logos/missing.png', fileName: 'missing.png', subscriptions: [{ id: 's1', name: 'Example' }] }]
    for (let i = 0; i < 3; i++) {
      mocks.prepare.mockRejectedValueOnce(new BackupMissingAssetsError(assets))
      const res = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers, payload: {} })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toEqual({ missingAssets: assets })
    }
    const res = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers,
      payload: { confirmedMissingAssets: ['logos/missing.png'] } })
    expect(res.json().data.token).toMatch(/^[a-f0-9]{48}$/)
    expect(mocks.prepare).toHaveBeenLastCalledWith(true, 'standard', ['logos/missing.png'])
  })

  it.each([{ format: 'legacy' }, { includeSubscriptionImages: 'false' }, { confirmedMissingAssets: true }, { confirmedMissingAssets: ['C:\\private.png'] }, { confirmedMissingAssets: ['logos/../private.png'] }])('rejects invalid export options %j', async payload => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers, payload })
    expect(res.statusCode).toBe(422)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('reports legacy capacity failures before issuing a download ticket', async () => {
    const { LegacyBackupLimitError } = await import('../../src/services/subtracker-backup.service')
    mocks.prepare.mockRejectedValueOnce(new LegacyBackupLimitError('limit'))
    const res = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers,
      payload: { format: 'legacy-v0.11' } })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.message).toContain('750 KiB')
    expect(res.json().data?.token).toBeUndefined()
  })

  it('requires Bearer auth to prepare or use the ordinary export endpoint', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const res = await app.inject({ method, url: '/api/v1/settings/export/backup' })
      expect(res.statusCode).toBe(401)
    }
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('downloads without a query bearer and cannot replay the capability', async () => {
    const token = await ticket()
    expect(token).toMatch(/^[a-f0-9]{48}$/)
    const url = `/api/v1/settings/export/backup/download/${token}`
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('ZIP')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.headers['cache-control']).toContain('no-store')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
  })
  it('rechecks the original session before a download', async () => {
    const token = await ticket()
    mocks.verify.mockResolvedValue(null)
    const res = await app.inject({ method: 'GET', url: `/api/v1/settings/export/backup/download/${token}` })
    expect(res.statusCode).toBe(401)
  })
  it('expires capabilities after one minute', async () => {
    const token = await ticket()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
    try {
      expect((await app.inject({ method: 'GET', url: `/api/v1/settings/export/backup/download/${token}` })).statusCode).toBe(401)
    } finally { clock.mockRestore() }
  })
  it('does not broaden the public-route exception to sibling paths or methods', async () => {
    const token = await ticket()
    for (const [method, url] of [
      ['POST', `/api/v1/settings/export/backup/download/${token}`],
      ['GET', `/api/v1/settings/export/backup/download/${token}/extra`],
      ['GET', '/api/v1/import/subtracker/limits'],
      ['DELETE', `/api/v1/import/subtracker/${token}`]
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401)
    }
  })
  it('bounds outstanding download capabilities', async () => {
    await ticket()
    await ticket()
    const third = await app.inject({ method: 'POST', url: '/api/v1/settings/export/backup', headers, payload: {} })
    expect(third.statusCode).toBe(409)
  })
})
