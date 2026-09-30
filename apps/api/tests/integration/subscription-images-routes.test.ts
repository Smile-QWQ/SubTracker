import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { additionalLogos, jpegLogo, pngLogo, webpLogo } from '../unit/logo-fixtures'

const state = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient, fetch: vi.fn() }))
vi.mock('../../src/db', () => ({ get prisma() { return state.prisma } }))
vi.mock('../../src/services/auth.service', () => ({
  verifyToken: vi.fn(async (token?: string) => token === 'test-bearer' ? { username: 'admin', mustChangePassword: false } : null)
}))
vi.mock('../../src/utils/remote-image', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/utils/remote-image')>(), fetchRemoteBody: state.fetch
}))
vi.mock('../../src/services/settings.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/settings.service')>(),
  getAppTimezone: vi.fn(async () => 'UTC'),
  getDefaultAdvanceReminderRulesSetting: vi.fn(async () => '3&09:30;0&09:30;')
}))
import { buildApp } from '../../src/app'
import {
  cleanupPendingSubscriptionImages, getSubscriptionImageStorageDir, removeSubscriptionImageFiles,
  SUBSCRIPTION_IMAGE_MAX_BYTES, writeSubscriptionImageFile
} from '../../src/services/subscription-images.service'
import { RemoteImageTooLargeError } from '../../src/utils/remote-image'

const headers = { authorization: 'Bearer test-bearer', 'x-subtracker-locale': 'en-US' }
const subscriptionPayload = {
  name: 'Images', amount: 1, currency: 'USD', startDate: '2026-01-01', nextRenewalDate: '2026-02-01',
  billingIntervalUnit: 'month', notes: 'Existing plain notes stay unchanged'
}
const missingId = 'cmissing000000000000000000'

describe('private subscription image routes with an isolated SQLite database', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let tempDir: string
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'subtracker-images-'))
    vi.stubEnv('SUBSCRIPTION_IMAGE_STORAGE_DIR', path.join(tempDir, 'private-images'))
    vi.stubEnv('BACKUP_TEMP_DIR', path.join(tempDir, 'backup-temp'))
    state.prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(tempDir, 'test.db').replace(/\\/g, '/')}` } } })
    // Generate DDL only; apply it exclusively to a newly created disposable database.
    const ddl = execFileSync(process.execPath, [createRequire(import.meta.url).resolve('prisma/build/index.js'), 'migrate', 'diff',
      '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'],
    { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'file:unused.db' } })
    for (const statement of ddl.split(';').filter((part) => part.trim())) await state.prisma.$executeRawUnsafe(statement)
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    app = await buildApp()
  }, 30_000)

  beforeEach(async () => {
    vi.restoreAllMocks()
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    state.fetch.mockReset()
    await state.prisma.subscriptionImage.deleteMany()
    await state.prisma.subscription.deleteMany()
    await state.prisma.setting.deleteMany()
    await rm(getSubscriptionImageStorageDir(), { recursive: true, force: true })
  })

  afterAll(async () => {
    await app?.close()
    await state.prisma?.$disconnect()
    cwdSpy?.mockRestore()
    vi.unstubAllEnvs()
    await rm(tempDir, { recursive: true, force: true })
  })

  async function upload(buffer = pngLogo, extra: Record<string, unknown> = {}) {
    return app.inject({ method: 'POST', url: '/api/v1/subscription-images/upload', headers,
      payload: { fileName: 'image.png', contentType: 'image/png', dataBase64: buffer.toString('base64'), ...extra } })
  }
  async function create(imageIds?: string[]) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscriptions', headers,
      payload: { ...subscriptionPayload, ...(imageIds === undefined ? {} : { imageIds }) } })
    expect(res.statusCode, res.body).toBe(201)
    return res.json().data.id as string
  }
  async function storedFile(id: string) {
    const row = await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id } })
    return path.join(getSubscriptionImageStorageDir(), row.storageName)
  }
  async function files() {
    return readdir(getSubscriptionImageStorageDir()).catch(() => [])
  }

  it.each([
    ['POST', '/subscription-images/upload'], ['POST', '/subscription-images/import'],
    ['GET', `/subscription-images/${missingId}/content`], ['DELETE', `/subscription-images/${missingId}`],
    ['GET', `/subscriptions/${missingId}/images`]
  ] as const)('requires bearer authentication for %s %s, including query-token requests', async (method, url) => {
    for (const suffix of ['', '?token=test-bearer', '?access_token=test-bearer']) {
      const res = await app.inject({ method, url: `/api/v1${url}${suffix}` })
      expect(res.statusCode).toBe(401)
    }
    expect(await state.prisma.subscriptionImage.count()).toBe(0)
  })

  it('uses the configured private storage directory and supports restored legacy subscription IDs', async () => {
    expect(getSubscriptionImageStorageDir()).toBe(path.join(tempDir, 'private-images'))
    await state.prisma.subscription.create({ data: {
      ...subscriptionPayload, id: 'legacy_subscription_1', billingIntervalUnit: 'month',
      startDate: new Date('2026-01-01'), nextRenewalDate: new Date('2026-02-01')
    } })
    const res = await app.inject({ url: '/api/v1/subscriptions/legacy_subscription_1/images', headers })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().data).toEqual([])
  })

  it.each([
    { buffer: pngLogo, contentType: 'image/png' }, { buffer: jpegLogo, contentType: 'image/jpeg' },
    { buffer: webpLogo, contentType: 'image/webp' }, ...additionalLogos
  ])('detects $contentType bytes despite an incorrect MIME/filename, returning only private metadata', async ({ buffer, contentType }) => {
    const res = await upload(buffer, { contentType: 'image/svg+xml', fileName: '../wrong.svg' })
    expect(res.statusCode).toBe(200)
    const image = res.json().data
    expect(Object.keys(image).sort()).toEqual(['contentType', 'createdAt', 'fileName', 'id', 'size'])
    expect(image).toMatchObject({ contentType, fileName: 'wrong.svg', size: buffer.length })
    expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: image.id } })).subscriptionId).toBeNull()
    const content = await app.inject({ url: `/api/v1/subscription-images/${image.id}/content`, headers })
    expect(content.statusCode).toBe(200)
    expect(content.rawPayload).toEqual(buffer)
    expect(content.headers).toMatchObject({ 'content-type': contentType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' })
    expect(content.headers['content-security-policy']).toContain('sandbox')
    const publicRes = await app.inject({ url: `/static/subscription-images/${image.id}`, headers })
    expect(publicRes.statusCode).toBe(404)
  })

  it.each(['', '!!!!', 'aA', 'aA===', 'a A==', 'ab==', 'data:image/png;base64,aA=='])('rejects malformed base64 %j without a file or row', async (dataBase64) => {
    expect((await upload(pngLogo, { dataBase64 })).statusCode).toBe(422)
    expect(await state.prisma.subscriptionImage.count()).toBe(0)
    expect(await files()).toEqual([])
  })

  it.each([Buffer.from('<html>not an image</html>'), pngLogo.subarray(0, 30), Buffer.alloc(0)])('rejects empty, unknown and truncated image bytes (%#)', async (buffer) => {
    expect((await upload(buffer)).statusCode).toBe(422)
    expect(await files()).toEqual([])
  })

  it('requires explicit SVG confirmation and preserves the same raw bytes with sandboxed content', async () => {
    const buffer = Buffer.from('<svg onload="alert(1)"><script>alert(2)</script></svg>')
    const unconfirmed = await upload(buffer)
    expect(unconfirmed.statusCode).toBe(422)
    expect(unconfirmed.json().error.code).toBe('subscription_image_error')
    expect(await files()).toEqual([])
    const confirmed = await upload(buffer, { svgConfirmed: true })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().data.contentType).toBe('image/svg+xml')
    const res = await app.inject({ url: `/api/v1/subscription-images/${confirmed.json().data.id}/content`, headers })
    expect(res.rawPayload).toEqual(buffer)
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
  })

  it('accepts exactly 20 MiB local bytes and rejects one byte over with 413', async () => {
    const bytes = Buffer.alloc(SUBSCRIPTION_IMAGE_MAX_BYTES, 32)
    bytes.write('<svg/>')
    const accepted = await upload(bytes, { svgConfirmed: true })
    expect(accepted.statusCode, accepted.body).toBe(200)
    expect(accepted.json().data.size).toBe(SUBSCRIPTION_IMAGE_MAX_BYTES)
    const rejected = await upload(Buffer.concat([bytes, Buffer.from(' ')]), { svgConfirmed: true })
    expect(rejected.statusCode).toBe(413)
    const bodyRejected = await upload(Buffer.alloc(SUBSCRIPTION_IMAGE_MAX_BYTES + 4096), { svgConfirmed: true })
    expect(bodyRejected.statusCode).toBe(413)
    expect(await state.prisma.subscriptionImage.count()).toBe(1)
  })



  it('returns malformed JSON as 400, not the global internal error response', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscription-images/upload',
      headers: { ...headers, 'content-type': 'application/json' }, payload: '{' })
    expect(res.statusCode).toBe(400)
  })

  it('downloads SVG once, keeps it unpersisted, then confirms by uploading identical bytes', async () => {
    const buffer = Buffer.from('<svg><script>raw()</script></svg>')
    state.fetch.mockResolvedValue({ buffer, contentType: 'image/png', finalUrl: 'https://example.com/note.svg' })
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscription-images/import', headers,
      payload: { url: 'https://example.com/download' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ requiresConfirmation: true, fileName: 'note.svg', contentType: 'image/svg+xml', dataBase64: buffer.toString('base64') })
    expect(await files()).toEqual([])
    expect(await state.prisma.subscriptionImage.count()).toBe(0)
    const confirmed = await upload(buffer, { ...res.json().data, svgConfirmed: true })
    expect(confirmed.statusCode).toBe(200)
    expect(await readFile(await storedFile(confirmed.json().data.id))).toEqual(buffer)
    expect(state.fetch).toHaveBeenCalledExactlyOnceWith('https://example.com/download', {}, { maxBytes: SUBSCRIPTION_IMAGE_MAX_BYTES })
  })

  it('imports non-SVG immediately and accepts a 20 MiB remote SVG for confirmation', async () => {
    state.fetch.mockResolvedValueOnce({ buffer: pngLogo, contentType: 'text/html', finalUrl: 'https://example.com/download' })
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscription-images/import', headers,
      payload: { url: 'https://example.com/download' } })
    expect(res.json().data).toMatchObject({ requiresConfirmation: false, image: { contentType: 'image/png' } })
    expect(await state.prisma.subscriptionImage.count()).toBe(1)
    const buffer = Buffer.alloc(SUBSCRIPTION_IMAGE_MAX_BYTES, 32)
    buffer.write('<svg/>')
    state.fetch.mockResolvedValueOnce({ buffer, contentType: 'image/svg+xml', finalUrl: 'https://example.com/large' })
    const large = await app.inject({ method: 'POST', url: '/api/v1/subscription-images/import', headers,
      payload: { url: 'https://example.com/large' } })
    expect(large.statusCode).toBe(200)
    expect(large.json().data.dataBase64).toBe(buffer.toString('base64'))
    expect(await state.prisma.subscriptionImage.count()).toBe(1)
  })

  it('blocks a private URL using the real downloader and never exposes its Logo error', async () => {
    const actual = await vi.importActual<typeof import('../../src/utils/remote-image')>('../../src/utils/remote-image')
    state.fetch.mockImplementationOnce(actual.fetchRemoteBody)
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscription-images/import', headers,
      payload: { url: 'http://127.0.0.1/internal' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('subscription_image_error')
    expect(res.body).not.toContain('Logo')
    expect(await files()).toEqual([])
  })

  it('maps remote size failures to 413 without persisting', async () => {
    state.fetch.mockRejectedValueOnce(new RemoteImageTooLargeError('Logo response exceeds 20 MiB'))
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscription-images/import', headers,
      payload: { url: 'https://example.com/large' } })
    expect(res.statusCode).toBe(413)
    expect(res.body).not.toContain('Logo')
    expect(await files()).toEqual([])
  })

  it('atomically binds selected pending images; omitted imageIds and note edits preserve them', async () => {
    const image = (await upload()).json().data
    const id = await create([image.id])
    const patch = await app.inject({ method: 'PATCH', url: `/api/v1/subscriptions/${id}`, headers, payload: { notes: 'changed text' } })
    expect(patch.statusCode).toBe(200)
    expect(patch.json().data.notes).toBe('changed text')
    const list = await app.inject({ url: `/api/v1/subscriptions/${id}/images`, headers })
    expect(list.json().data).toEqual([image])
    const kept = await app.inject({ method: 'PATCH', url: `/api/v1/subscriptions/${id}`, headers, payload: { imageIds: [image.id] } })
    expect(kept.statusCode).toBe(200)
    const file = await storedFile(image.id)
    const detached = await app.inject({ method: 'PATCH', url: `/api/v1/subscriptions/${id}`, headers, payload: { imageIds: [] } })
    expect(detached.statusCode).toBe(200)
    expect(await state.prisma.subscriptionImage.count()).toBe(0)
    await expect(access(file)).rejects.toThrow()
  })

  it('lists equal-timestamp images by ID and never includes another subscription or pending uploads', async () => {
    const ids = [(await upload()).json().data.id, (await upload()).json().data.id]
    const id = await create(ids.slice().reverse())
    await upload()
    await create([(await upload()).json().data.id])
    await state.prisma.subscriptionImage.updateMany({ where: { subscriptionId: id }, data: { createdAt: new Date('2026-01-01') } })
    const res = await app.inject({ url: `/api/v1/subscriptions/${id}/images`, headers })
    expect(res.json().data.map((image: { id: string }) => image.id)).toEqual(ids.sort())
  })

  it('rejects cross-subscription or missing selections and rolls back subscription create/update and pending claims', async () => {
    const bound = (await upload()).json().data.id
    const owner = await create([bound])
    const pending = (await upload()).json().data.id
    const target = await create()
    for (const forbidden of [bound, missingId]) {
      const createRes = await app.inject({ method: 'POST', url: '/api/v1/subscriptions', headers,
        payload: { ...subscriptionPayload, imageIds: [pending, forbidden] } })
      expect(createRes.statusCode).toBe(422)
      const patchRes = await app.inject({ method: 'PATCH', url: `/api/v1/subscriptions/${target}`, headers,
        payload: { notes: 'must roll back', imageIds: [pending, forbidden] } })
      expect(patchRes.statusCode).toBe(422)
      expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: pending } })).subscriptionId).toBeNull()
    }
    expect(await state.prisma.subscription.count()).toBe(2)
    expect((await state.prisma.subscription.findUniqueOrThrow({ where: { id: target } })).notes).toBe(subscriptionPayload.notes)
    expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: bound } })).subscriptionId).toBe(owner)
    expect(await files()).toHaveLength(2)
  })

  it('does not delete detached files when a later transaction operation fails', async () => {
    const oldImage = (await upload()).json().data.id
    const pending = (await upload()).json().data.id
    const id = await create([oldImage])
    const oldFile = await storedFile(oldImage)
    // Run the real transaction, then fail after replacement and the final detail read.
    const original = state.prisma
    state.prisma = new Proxy(original, {
      get(target, key) {
        if (key === '$transaction') return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          original.$transaction(async (tx) => {
            await callback(tx)
            throw new Error('forced transaction failure')
          })
        return Reflect.get(target, key)
      }
    })
    try {
      const res = await app.inject({ method: 'PATCH', url: `/api/v1/subscriptions/${id}`, headers,
        payload: { imageIds: [pending] } })
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      state.prisma = original
    }
    expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: oldImage } })).subscriptionId).toBe(id)
    expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: pending } })).subscriptionId).toBeNull()
    await expect(access(oldFile)).resolves.toBeUndefined()
  })

  it('enforces max20 and unique selections with no partial attachment', async () => {
    const ids: string[] = []
    for (let index = 0; index < 21; index++) ids.push((await upload()).json().data.id)
    const id = await create(ids.slice(0, 20))
    for (const imageIds of [ids, [ids[20], ids[20]]]) {
      const res = await app.inject({ method: 'PATCH', url: `/api/v1/subscriptions/${id}`, headers, payload: { imageIds } })
      expect(res.statusCode).toBe(422)
    }
    expect(await state.prisma.subscriptionImage.count({ where: { subscriptionId: id } })).toBe(20)
    expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: ids[20] } })).subscriptionId).toBeNull()
  })

  it('cancels pending uploads only; rejects deleting saved images and preserves their file', async () => {
    const pending = (await upload()).json().data.id
    const pendingFile = await storedFile(pending)
    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/subscription-images/${pending}`, headers })
    expect(removed.statusCode).toBe(200)
    await expect(access(pendingFile)).rejects.toThrow()
    const bound = (await upload()).json().data.id
    await create([bound])
    const rejected = await app.inject({ method: 'DELETE', url: `/api/v1/subscription-images/${bound}`, headers })
    expect(rejected.statusCode).toBe(409)
    await expect(access(await storedFile(bound))).resolves.toBeUndefined()
  })

  it('lazily cleans abandoned pending rows older than24h, retaining recent and bound images', async () => {
    const stale = (await upload()).json().data.id
    const recent = (await upload()).json().data.id
    const bound = (await upload()).json().data.id
    await create([bound])
    const staleFile = await storedFile(stale)
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await state.prisma.subscriptionImage.updateMany({ where: { id: { in: [stale, bound] } }, data: { createdAt: old } })
    await upload()
    expect(await state.prisma.subscriptionImage.findUnique({ where: { id: stale } })).toBeNull()
    await expect(access(staleFile)).rejects.toThrow()
    await expect(access(await storedFile(recent))).resolves.toBeUndefined()
    await expect(access(await storedFile(bound))).resolves.toBeUndefined()
  })

  it('a successful attach before lazy cleanup protects even an old pending upload', async () => {
    const pending = (await upload()).json().data.id
    await state.prisma.subscriptionImage.update({ where: { id: pending }, data: { createdAt: new Date(0) } })
    const id = await create([pending])
    await cleanupPendingSubscriptionImages()
    expect((await state.prisma.subscriptionImage.findUniqueOrThrow({ where: { id: pending } })).subscriptionId).toBe(id)
    await expect(access(await storedFile(pending))).resolves.toBeUndefined()
  })

  it('cleans files for single and batch subscription deletion while preserving active rows', async () => {
    const singleImage = (await upload()).json().data.id
    const singleId = await create([singleImage])
    const singleFile = await storedFile(singleImage)
    await state.prisma.subscription.update({ where: { id: singleId }, data: { status: 'paused' } })
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/subscriptions/${singleId}`, headers })).statusCode).toBe(200)
    await expect(access(singleFile)).rejects.toThrow()
    const batchImage = (await upload()).json().data.id
    const batchId = await create([batchImage])
    const batchFile = await storedFile(batchImage)
    const activeImage = (await upload()).json().data.id
    const activeId = await create([activeImage])
    await state.prisma.subscription.update({ where: { id: batchId }, data: { status: 'cancelled' } })
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscriptions/batch/delete', headers, payload: { ids: [batchId, activeId] } })
    expect(res.json().data).toMatchObject({ successCount: 1, failureCount: 1 })
    await expect(access(batchFile)).rejects.toThrow()
    expect(await state.prisma.subscriptionImage.count()).toBe(1)
    await expect(access(await storedFile(activeImage))).resolves.toBeUndefined()
  })

  it('cleans up a file when database row creation fails', async () => {
    vi.spyOn(state.prisma.subscriptionImage, 'create').mockRejectedValueOnce(new Error('forced insert failure'))
    expect((await upload()).statusCode).toBe(500)
    expect(await files()).toEqual([])
  })

  it('validates the backup file helper independently of DB state and removes files best-effort', async () => {
    await expect(writeSubscriptionImageFile(Buffer.from('not image'), 'image/png')).rejects.toThrow('invalidImage')
    await expect(writeSubscriptionImageFile(pngLogo, 'image/jpeg')).rejects.toThrow('invalidImage')
    await expect(writeSubscriptionImageFile(Buffer.alloc(SUBSCRIPTION_IMAGE_MAX_BYTES + 1), 'image/png')).rejects.toThrow('tooLarge')
    const name = await writeSubscriptionImageFile(pngLogo, 'image/png')
    expect(name).toMatch(/^[\w-]+\.png$/)
    expect(await state.prisma.subscriptionImage.count()).toBe(0)
    await expect(removeSubscriptionImageFiles([name, name, '../escape.png'])).resolves.toBeUndefined()
  })
})
