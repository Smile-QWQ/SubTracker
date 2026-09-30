import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { buffer as collectBuffer } from 'node:stream/consumers'
import { additionalLogos, pngLogo } from './logo-fixtures'
import type { SubtrackerBackupAssetImageDto } from '@subtracker/shared'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    tag: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn()
    },
    subscription: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn()
    },
    subscriptionImage: {
      findMany: vi.fn(),
      deleteMany: vi.fn()
    },
    paymentRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn()
    },
    subscriptionTag: {
      createMany: vi.fn(),
      deleteMany: vi.fn()
    },
    setting: {
      deleteMany: vi.fn()
    }
  },
  getAppSettingsMock: vi.fn(),
  getPrimaryWebhookEndpointMock: vi.fn(),
  getSubscriptionOrderMock: vi.fn(),
  setSubscriptionOrderMock: vi.fn(),
  setSettingMock: vi.fn(),
  saveImportedLogoBufferMock: vi.fn(),
  getImageStorageDirMock: vi.fn(),
  writeImageFileMock: vi.fn(),
  removeImageFilesMock: vi.fn(),
  getLocalLogoLibraryMock: vi.fn(),
  getLogoStorageDirMock: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: mocks.prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: mocks.getAppSettingsMock,
  setSetting: mocks.setSettingMock
}))

vi.mock('../../src/services/webhook.service', () => ({
  getPrimaryWebhookEndpoint: mocks.getPrimaryWebhookEndpointMock
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  getSubscriptionOrder: mocks.getSubscriptionOrderMock,
  setSubscriptionOrder: mocks.setSubscriptionOrderMock
}))

vi.mock('../../src/services/logo.service', () => ({
  getLocalLogoLibrary: mocks.getLocalLogoLibraryMock,
  getLogoStorageDir: mocks.getLogoStorageDirMock,
  saveImportedLogoBuffer: mocks.saveImportedLogoBufferMock
}))

vi.mock('../../src/services/subscription-images.service', () => ({
  getSubscriptionImageStorageDir: mocks.getImageStorageDirMock,
  writeSubscriptionImageFile: mocks.writeImageFileMock,
  removeSubscriptionImageFiles: mocks.removeImageFilesMock
}))

import AdmZip from 'adm-zip'
import * as streamingZip from '../../src/utils/streaming-zip'
import { BackupMissingAssetsError, cleanupExpiredImports, commitSubtrackerBackup, createSubtrackerBackupArchive, discardSubtrackerBackup, disposeSubtrackerBackups, inspectSubtrackerBackupFile as inspectStream } from '../../src/services/subtracker-backup.service'

let fixtureRoot: string
// Legacy ZIP fixtures remain unchanged; the production transport now receives raw streams.
function inspectSubtrackerBackupFile(input: { base64: string; filename: string; contentType: string }, locale?: 'zh-CN' | 'en-US') {
  return inspectStream(Readable.from(Buffer.from(input.base64, 'base64')), locale)
}

function makeImageBackup(options: { assets?: SubtrackerBackupAssetImageDto[]; bytes?: Buffer; omitFile?: boolean } = {}) {
  const asset: SubtrackerBackupAssetImageDto = {
    id: 'image_1', subscriptionId: 'sub_1', path: 'subscription-images/image_1.png',
    fileName: '订单.png', contentType: 'image/png', size: pngLogo.length, createdAt: '2026-04-01T00:00:00.000Z'
  }
  const assets = options.assets ?? [asset]
  const zip = new AdmZip()
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({
    schemaVersion: 2, exportedAt: '2026-05-02T00:00:00.000Z', app: 'SubTracker', scope: 'business-complete',
    data: {
      settings: { timezone: 'Asia/Shanghai' }, notificationWebhook: {}, tags: [], paymentRecords: [], subscriptionOrder: ['sub_1'],
      subscriptions: [{
        id: 'sub_1', name: 'Subscription', notes: 'Keep this text', description: '', amount: 10, currency: 'CNY',
        billingIntervalCount: 1, billingIntervalUnit: 'month', status: 'active', autoRenew: false,
        startDate: '2026-04-01', nextRenewalDate: '2026-05-01', notifyDaysBefore: 3, webhookEnabled: false,
        tagIds: [], createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z'
      }]
    },
    assets: { logos: [], subscriptionImages: assets }
  })))
  if (!options.omitFile) {
    for (const item of assets) zip.addFile(item.path, options.bytes ?? pngLogo)
  }
  return { asset, input: { filename: 'images.zip', contentType: 'application/zip', base64: zip.toBuffer().toString('base64') } }
}

describe('subtracker backup service', () => {
  it('binds preview tokens to their session and atomically consumes them', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.getSubscriptionOrderMock.mockResolvedValue([])
    const bytes = Buffer.from(makeImageBackup().input.base64, 'base64')
    const preview = await inspectStream(Readable.from(bytes), 'en-US', 'owner')
    await discardSubtrackerBackup(preview.importToken, 'different-owner')
    await expect(commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false }, 'en-US', 'different-owner')).rejects.toThrow()
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
    await commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false }, 'en-US', 'owner')
    await expect(commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false }, 'en-US', 'owner')).rejects.toThrow()
    expect(await readdir(path.join(fixtureRoot, 'temp'))).toEqual([])
  })

  it('removes preview files on cancellation and expiry', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    const preview = await inspectSubtrackerBackupFile(makeImageBackup().input)
    await discardSubtrackerBackup(preview.importToken)
    expect(await readdir(path.join(fixtureRoot, 'temp'))).toEqual([])
    await inspectSubtrackerBackupFile(makeImageBackup().input)
    vi.setSystemTime(new Date('2026-05-02T09:00:00.000Z'))
    await cleanupExpiredImports()
    expect(await readdir(path.join(fixtureRoot, 'temp'))).toEqual([])
  })

  it('caps pending previews and cleans a rejected archive', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    await expect(inspectStream(Readable.from(Buffer.from('not a ZIP')))).rejects.toThrow()
    expect(await readdir(path.join(fixtureRoot, 'temp'))).toEqual([])
    await inspectSubtrackerBackupFile(makeImageBackup().input)
    await inspectSubtrackerBackupFile(makeImageBackup().input)
    await expect(inspectSubtrackerBackupFile(makeImageBackup().input)).rejects.toThrow('pending')
    expect(await readdir(path.join(fixtureRoot, 'temp'))).toHaveLength(2)
  })

  it('revalidates disk contents before destructive restore', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    const preview = await inspectSubtrackerBackupFile(makeImageBackup().input)
    const [directory] = await readdir(path.join(fixtureRoot, 'temp'))
    await writeFile(path.join(fixtureRoot, 'temp', directory, 'archive.zip'), 'corrupt')
    await expect(commitSubtrackerBackup({ importToken: preview.importToken, mode: 'replace', restoreSettings: true })).rejects.toThrow()
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
    expect(mocks.prismaMock.subscription.deleteMany).not.toHaveBeenCalled()
    expect(await readdir(path.join(fixtureRoot, 'temp'))).toEqual([])
  })

  it('exports an explicitly marked lightweight backup without querying image records', async () => {
    mocks.getAppSettingsMock.mockResolvedValue({ timezone: 'UTC' })
    mocks.getPrimaryWebhookEndpointMock.mockResolvedValue({})
    mocks.getSubscriptionOrderMock.mockResolvedValue([])
    mocks.getLocalLogoLibraryMock.mockResolvedValue([])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
    const archive = await createSubtrackerBackupArchive(false)
    const bytes = await collectBuffer(archive.stream)
    const manifest = JSON.parse(new AdmZip(bytes).getEntries()[0].getData().toString())
    expect(archive.filename).toContain('-without-images.zip')
    expect(manifest.includesSubscriptionImages).toBe(false)
    expect(manifest.assets.subscriptionImages).toEqual([])
    expect(mocks.prismaMock.subscriptionImage.findMany).not.toHaveBeenCalled()
    const preview = await inspectStream(Readable.from(bytes), 'en-US')
    expect(preview.summary.includesSubscriptionImages).toBe(false)
    expect(preview.warnings.join(' ')).toContain('does not replace a complete backup')
  })

  describe('missing source assets', () => {
    async function setupSources() {
      const data = JSON.parse(new AdmZip(Buffer.from(makeImageBackup().input.base64, 'base64')).getEntries().find(entry => entry.entryName === 'manifest.json')!.getData().toString()).data
      const subscription = { ...data.subscriptions[0], startDate: new Date('2026-04-01'), nextRenewalDate: new Date('2026-05-01'),
        createdAt: new Date(), updatedAt: new Date(), tags: [], logoUrl: '/static/logos/gone.png', logoSource: 'upload', logoFetchedAt: new Date() }
      const subscriptions = [subscription, { ...subscription, id: 'sub_2', name: 'Shared logo' }]
      mocks.getAppSettingsMock.mockResolvedValue(data.settings)
      mocks.getPrimaryWebhookEndpointMock.mockResolvedValue({})
      mocks.getSubscriptionOrderMock.mockResolvedValue(['sub_1', 'sub_2'])
      mocks.getLocalLogoLibraryMock.mockResolvedValue([{ logoUrl: '/static/logos/healthy.png' }])
      mocks.saveImportedLogoBufferMock.mockResolvedValue({ logoUrl: '/static/logos/restored.png', logoSource: 'backup-zip', logoFetchedAt: new Date() })
      mocks.prismaMock.tag.findMany.mockResolvedValue([])
      mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
      mocks.prismaMock.subscription.findMany.mockResolvedValue(subscriptions)
      mocks.prismaMock.subscriptionImage.findMany.mockResolvedValue([
        { id: 'i1', subscriptionId: 'sub_1', storageName: 'gone.png', fileName: 'Missing receipt.png', contentType: 'image/png', size: pngLogo.length, createdAt: new Date() },
        { id: 'i2', subscriptionId: 'sub_1', storageName: 'healthy.png', fileName: 'Kept receipt.png', contentType: 'image/png', size: pngLogo.length, createdAt: new Date() }
      ])
      await writeFile(path.join(fixtureRoot, 'logos', 'healthy.png'), pngLogo)
      await writeFile(path.join(fixtureRoot, 'images', 'healthy.png'), pngLogo)
      return subscriptions
    }
    const paths = ['logos/gone.png', 'subscription-images/gone.png']

    it('lists missing files with associated subscriptions and requires consent for every missing path', async () => {
      await setupSources()
      const error = await createSubtrackerBackupArchive().catch(error => error)
      expect(error).toBeInstanceOf(BackupMissingAssetsError)
      expect(error.assets.map((asset: { path: string }) => asset.path)).toEqual(paths)
      expect(error.assets[0].subscriptions.map((sub: { id: string }) => sub.id)).toEqual(['sub_1', 'sub_2'])
      expect(error.assets[1]).toMatchObject({ kind: 'subscriptionImage', fileName: 'Missing receipt.png', subscriptions: [{ id: 'sub_1', name: 'Subscription' }] })
      await expect(createSubtrackerBackupArchive(true, 'standard', paths.slice(0, 1))).rejects.toBeInstanceOf(BackupMissingAssetsError)
      expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
    })

    it.each(['standard', 'legacy-v0.11'] as const)('repairs only the %s export copy and marks the restorable backup incomplete', async format => {
      const original = await setupSources()
      const archive = await createSubtrackerBackupArchive(true, format, paths)
      const bytes = await collectBuffer(archive.stream)
      const zip = new AdmZip(bytes)
      const manifest = JSON.parse(zip.getEntries().find(entry => entry.entryName === 'manifest.json')!.getData().toString())
      expect(archive.filename).toContain('-incomplete')
      expect(manifest.schemaVersion).toBe(format === 'standard' ? 2 : 1)
      expect(manifest.omittedAssets).toHaveLength(format === 'standard' ? 2 : 1)
      expect(manifest.data.subscriptions).toHaveLength(2)
      for (const sub of manifest.data.subscriptions) expect(sub).toMatchObject({ logoUrl: null, logoSource: null, logoFetchedAt: null, notes: 'Keep this text' })
      expect(original.every(sub => sub.logoUrl === '/static/logos/gone.png')).toBe(true)
      expect(zip.getEntries().find(entry => entry.entryName === 'logos/healthy.png')!.getData()).toEqual(pngLogo)
      if (format === 'standard') {
        expect(manifest.assets.subscriptionImages).toHaveLength(1)
        expect(zip.getEntries().find(entry => entry.entryName === 'subscription-images/healthy.png')!.getData()).toEqual(pngLogo)
      } else expect(mocks.prismaMock.subscriptionImage.findMany).not.toHaveBeenCalled()
      expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
      expect(mocks.removeImageFilesMock).not.toHaveBeenCalled()
      mocks.prismaMock.subscription.findMany.mockResolvedValue([])
      for (const locale of ['zh-CN', 'en-US'] as const) {
        const preview = await inspectStream(Readable.from(bytes), locale)
        expect(preview.warnings.some(message => message.includes(locale === 'zh-CN' ? '不完整备份' : 'incomplete backup'))).toBe(true)
        await discardSubtrackerBackup(preview.importToken)
      }
      const preview = await inspectStream(Readable.from(bytes))
      await commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false })
      expect(mocks.prismaMock.subscription.create).toHaveBeenCalledTimes(2)
    })

    it('does not silently omit newly missing files and includes recovered files even if previously confirmed', async () => {
      await setupSources()
      await rm(path.join(fixtureRoot, 'logos', 'healthy.png'))
      await expect(createSubtrackerBackupArchive(true, 'standard', paths)).rejects.toBeInstanceOf(BackupMissingAssetsError)
      await writeFile(path.join(fixtureRoot, 'logos', 'healthy.png'), pngLogo)
      await writeFile(path.join(fixtureRoot, 'logos', 'gone.png'), pngLogo)
      await writeFile(path.join(fixtureRoot, 'images', 'gone.png'), pngLogo)
      const archive = await createSubtrackerBackupArchive(true, 'standard', paths)
      const zip = new AdmZip(await collectBuffer(archive.stream))
      expect(archive.filename).not.toContain('incomplete')
      expect(JSON.parse(zip.getEntries().find(entry => entry.entryName === 'manifest.json')!.getData().toString()).omittedAssets).toBeUndefined()
      expect(zip.getEntries().find(entry => entry.entryName === 'logos/gone.png')!.getData()).toEqual(pngLogo)
    })

    it('does not treat invalid file sizes or permission failures as missing', async () => {
      await setupSources()
      await writeFile(path.join(fixtureRoot, 'images', 'healthy.png'), Buffer.from('incorrect size'))
      await expect(createSubtrackerBackupArchive(true, 'standard', paths)).rejects.toThrow('Invalid stored subscription image size')
      const spy = vi.spyOn(streamingZip, 'describeZipSource').mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
      try { await expect(createSubtrackerBackupArchive(true, 'standard', paths)).rejects.toThrow('permission denied') } finally { spy.mockRestore() }
    })
  })

  it('blocks oversized legacy exports without deleting files and still allows standard export', async () => {
    mocks.getAppSettingsMock.mockResolvedValue({ timezone: 'UTC' })
    mocks.getPrimaryWebhookEndpointMock.mockResolvedValue({})
    mocks.getSubscriptionOrderMock.mockResolvedValue([])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
    mocks.getLocalLogoLibraryMock.mockResolvedValue([{ logoUrl: '/static/logos/large.png' }])
    const image = Buffer.alloc(751 * 1024, 7)
    await writeFile(path.join(fixtureRoot, 'logos', 'large.png'), image)
    await expect(createSubtrackerBackupArchive(true, 'legacy-v0.11')).rejects.toThrow('Legacy backup exceeds')
    expect(mocks.prismaMock.subscriptionImage.findMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.subscription.deleteMany).not.toHaveBeenCalled()
    const standard = await createSubtrackerBackupArchive()
    const zip = new AdmZip(await collectBuffer(standard.stream))
    expect(zip.getEntries().find(entry => entry.entryName === 'logos/large.png')!.getData()).toEqual(image)
  })

  it.each(['zh-CN', 'en-US'] as const)('localizes backup warnings in %s instead of showing message keys', async (locale) => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    const { input } = makeImageBackup()
    const preview = await inspectSubtrackerBackupFile(input, locale)
    expect(preview.warnings).toHaveLength(4)
    expect(preview.warnings.every(message => !message.startsWith('api.'))).toBe(true)
    expect(preview.warnings[0]).toContain(locale === 'zh-CN' ? '本地 Logo' : 'local logo')
  })

  afterEach(async () => {
    await disposeSubtrackerBackups()
    await rm(fixtureRoot, { recursive: true, force: true })
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'subtracker-backup-test-'))
    await mkdir(path.join(fixtureRoot, 'logos'))
    await mkdir(path.join(fixtureRoot, 'images'))
    vi.stubEnv('BACKUP_TEMP_DIR', path.join(fixtureRoot, 'temp'))
    mocks.prismaMock.$transaction.mockReset().mockImplementation(callback => callback(mocks.prismaMock))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-02T08:00:00.000Z'))
    mocks.prismaMock.tag.findMany.mockReset()
    mocks.prismaMock.subscription.findMany.mockReset()
    mocks.prismaMock.subscription.deleteMany.mockReset()
    mocks.prismaMock.tag.deleteMany.mockReset()
    mocks.prismaMock.subscriptionImage.findMany.mockReset().mockResolvedValue([])
    mocks.prismaMock.subscriptionImage.deleteMany.mockReset()
    mocks.getImageStorageDirMock.mockReset().mockReturnValue(path.join(fixtureRoot, 'images'))
    mocks.writeImageFileMock.mockReset().mockResolvedValue('restored.png')
    mocks.removeImageFilesMock.mockReset().mockResolvedValue(undefined)
    mocks.prismaMock.paymentRecord.findMany.mockReset()
    mocks.prismaMock.tag.create.mockReset()
    mocks.prismaMock.subscription.create.mockReset()
    mocks.prismaMock.paymentRecord.create.mockReset()
    mocks.prismaMock.paymentRecord.createMany.mockReset()
    mocks.prismaMock.paymentRecord.deleteMany.mockReset()
    mocks.prismaMock.subscriptionTag.createMany.mockReset()
    mocks.prismaMock.subscriptionTag.deleteMany.mockReset()
    mocks.prismaMock.setting.deleteMany.mockReset()
    mocks.getAppSettingsMock.mockReset()
    mocks.getPrimaryWebhookEndpointMock.mockReset()
    mocks.getSubscriptionOrderMock.mockReset()
    mocks.setSubscriptionOrderMock.mockReset()
    mocks.setSettingMock.mockReset()
    mocks.saveImportedLogoBufferMock.mockReset()
    mocks.getLocalLogoLibraryMock.mockReset()
    mocks.getLogoStorageDirMock.mockReset().mockReturnValue(path.join(fixtureRoot, 'logos'))
  })

  it('restores private images with their subscription and counts them separately from logos', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.getSubscriptionOrderMock.mockResolvedValue([])
    const preview = await inspectSubtrackerBackupFile(makeImageBackup().input)
    expect(preview.summary.subscriptionImagesTotal).toBe(1)
    const result = await commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false })
    expect(result.importedSubscriptionImages).toBe(1)
    expect(result.importedLogos).toBe(0)
    expect(mocks.writeImageFileMock).toHaveBeenCalledWith(pngLogo, 'image/png')
    expect(mocks.prismaMock.subscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      notes: 'Keep this text', images: { create: [expect.objectContaining({ fileName: '订单.png', storageName: 'restored.png', size: pngLogo.length })] }
    }) })
  })

  it('does not duplicate images when append skips an existing subscription', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([{ id: 'sub_1' }])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    const preview = await inspectSubtrackerBackupFile(makeImageBackup().input)
    const result = await commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false })
    expect(result.importedSubscriptionImages).toBe(0)
    expect(mocks.writeImageFileMock).not.toHaveBeenCalled()
  })

  it('cleans staged image files when restoring a subscription fails', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.prismaMock.subscription.create.mockRejectedValueOnce(new Error('database failure'))
    const preview = await inspectSubtrackerBackupFile(makeImageBackup().input)
    await expect(commitSubtrackerBackup({ importToken: preview.importToken, mode: 'append', restoreSettings: false })).rejects.toThrow('database failure')
    expect(mocks.removeImageFilesMock).toHaveBeenCalledWith(['restored.png'])
  })

  it.each([
    { path: '../private.png' }, { path: 'subscription-images/../private.png' },
    { subscriptionId: 'missing' }, { size: 20 * 1024 * 1024 + 1 },
    { size: -1 }, { contentType: 'text/html' }, { createdAt: 'invalid' }, { fileName: '' }
  ])('rejects invalid image metadata before any restore: %s', async (changes) => {
    const { asset } = makeImageBackup()
    await expect(inspectSubtrackerBackupFile(makeImageBackup({ assets: [{ ...asset, ...changes }] }).input)).rejects.toThrow()
    expect(mocks.prismaMock.subscription.deleteMany).not.toHaveBeenCalled()
    expect(mocks.writeImageFileMock).not.toHaveBeenCalled()
  })

  it('rejects missing image files and forged non-image bytes', async () => {
    await expect(inspectSubtrackerBackupFile(makeImageBackup({ omitFile: true }).input)).rejects.toThrow()
    const bytes = Buffer.alloc(pngLogo.length, 65)
    await expect(inspectSubtrackerBackupFile(makeImageBackup({ bytes }).input)).rejects.toThrow()
  })

  it('rejects more than 20 images per subscription and duplicate IDs', async () => {
    const { asset } = makeImageBackup()
    const assets = Array.from({ length: 21 }, (_, i) => ({ ...asset, id: `img_${i}`, path: `subscription-images/img_${i}.png` }))
    await expect(inspectSubtrackerBackupFile(makeImageBackup({ assets }).input)).rejects.toThrow()
    await expect(inspectSubtrackerBackupFile(makeImageBackup({ assets: [asset, { ...asset, path: 'subscription-images/other.png' }] }).input)).rejects.toThrow()
  })

  it('removes existing image rows and files in replace mode', async () => {
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.prismaMock.subscriptionImage.findMany.mockResolvedValue([{ storageName: 'old.png' }])
    const preview = await inspectSubtrackerBackupFile(makeImageBackup().input)
    await commitSubtrackerBackup({ importToken: preview.importToken, mode: 'replace', restoreSettings: true })
    expect(mocks.prismaMock.subscriptionImage.deleteMany).toHaveBeenCalled()
    expect(mocks.removeImageFilesMock).toHaveBeenCalledWith(['old.png'])
  })

  it.each([undefined, 'recurring', 'lifetime'] as const)('imports %s billing type and batch inserts payment records', async (billingType) => {
    const inspectZip = new AdmZip()
    inspectZip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          exportedAt: '2026-05-02T08:00:00.000Z',
          app: 'SubTracker',
          scope: 'business-complete',
          data: {
            settings: {
              baseCurrency: 'CNY',
              timezone: 'Asia/Shanghai',
              defaultNotifyDays: 3,
              defaultAdvanceReminderRules: '3&09:30;0&09:30;',
              rememberSessionDays: 7,
              notifyOnDueDay: true,
              mergeMultiSubscriptionNotifications: true,
              monthlyBudgetBase: null,
              yearlyBudgetBase: null,
              enableTagBudgets: false,
              overdueReminderDays: [1, 2, 3],
              defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
              tagBudgets: {},
              emailNotificationsEnabled: false,
              emailProvider: 'smtp',
              pushplusNotificationsEnabled: false,
              telegramNotificationsEnabled: false,
              serverchanNotificationsEnabled: false,
              gotifyNotificationsEnabled: false,
              barkNotificationsEnabled: false,
              notifyxNotificationsEnabled: false,
              appriseNotificationsEnabled: false,
              smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
              resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
              pushplusConfig: { token: '', topic: '' },
              telegramConfig: { botToken: '', chatId: '' },
              serverchanConfig: { sendkey: '' },
              gotifyConfig: { url: '', token: '', ignoreSsl: false },
              barkConfig: { serverUrl: '', deviceKey: '', isArchive: false },
              notifyxConfig: { apiKey: '', team: '' },
              appriseConfig: {
                apiBaseUrl: '',
                key: '',
                ignoreSsl: false,
                targets: [],
                lastSyncStatus: 'idle',
                lastSyncAt: null,
                lastSyncError: null
              },
              aiConfig: {
                enabled: false,
                dashboardSummaryEnabled: false,
                providerPreset: 'custom',
                providerName: 'DeepSeek',
                baseUrl: 'https://api.deepseek.com',
                apiKey: '',
                model: 'deepseek-chat',
                timeoutMs: 30000,
                promptTemplate: '',
                dashboardSummaryPromptTemplate: '',
                capabilities: { vision: false, structuredOutput: true }
              }
            },
            notificationWebhook: {
              enabled: false,
              url: '',
              requestMethod: 'POST',
              headers: 'Content-Type: application/json',
              payloadTemplate: '{}',
              ignoreSsl: false
            },
            tags: [{ id: 'tag_1', name: '影音', color: '#3b82f6', icon: 'apps-outline', sortOrder: 1 }],
            subscriptions: [
              {
                id: 'sub_new',
                billingType,
                name: 'Netflix',
                description: '',
                websiteUrl: 'https://netflix.com',
                logoUrl: null,
                logoSource: null,
                logoFetchedAt: null,
                status: 'active',
                amount: 15,
                currency: 'USD',
                billingIntervalCount: 1,
                billingIntervalUnit: 'month',
                autoRenew: true,
                startDate: '2026-04-01',
                nextRenewalDate: '2026-05-01',
                notifyDaysBefore: 3,
                advanceReminderRules: '3&09:30;0&09:30;',
                overdueReminderRules: '1&09:30;',
                webhookEnabled: true,
                notes: '',
                tagIds: ['tag_1'],
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z'
              }
            ],
            paymentRecords: [
              {
                id: 'pay_new',
                subscriptionId: 'sub_new',
                amount: 15,
                currency: 'USD',
                baseCurrency: 'CNY',
                convertedAmount: 108,
                exchangeRate: 7.2,
                paidAt: '2026-04-01T00:00:00.000Z',
                periodStart: '2026-04-01T00:00:00.000Z',
                periodEnd: '2026-04-30T00:00:00.000Z',
                createdAt: '2026-04-01T00:00:00.000Z'
              }
            ],
            subscriptionOrder: ['sub_new']
          },
          assets: {
            logos: []
          }
        }),
        'utf8'
      )
    )

    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
    const preview = await inspectSubtrackerBackupFile({
      filename: 'backup.zip',
      contentType: 'application/zip',
      base64: inspectZip.toBuffer().toString('base64')
    })

    mocks.prismaMock.tag.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([{ id: 'sub_old' }])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([{ id: 'pay_old' }])
    mocks.prismaMock.subscription.create.mockResolvedValue(undefined)
    mocks.prismaMock.subscriptionTag.createMany.mockResolvedValue({ count: 1 })
    mocks.prismaMock.paymentRecord.createMany.mockResolvedValue({ count: 1 })
    mocks.getSubscriptionOrderMock.mockResolvedValue(['sub_old'])

    const result = await commitSubtrackerBackup({
      importToken: preview.importToken,
      mode: 'append',
      restoreSettings: false
    })

    expect(result.importedPaymentRecords).toBe(1)
    expect(mocks.prismaMock.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingType: billingType ?? 'recurring',
        autoRenew: billingType !== 'lifetime',
        webhookEnabled: billingType !== 'lifetime',
        nextRenewalDate: new Date(billingType === 'lifetime' ? '2026-03-31T16:00:00.000Z' : '2026-04-30T16:00:00.000Z')
      })
    })
    expect(mocks.prismaMock.paymentRecord.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.paymentRecord.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'pay_new',
          subscriptionId: 'sub_new'
        })
      ]
    })
    expect(mocks.setSubscriptionOrderMock).toHaveBeenCalledWith(['sub_old', 'sub_new'], mocks.prismaMock)
  })

  it('does not rewrite order during append no-op', async () => {
    const inspectZip = new AdmZip()
    inspectZip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          exportedAt: '2026-05-02T08:00:00.000Z',
          app: 'SubTracker',
          scope: 'business-complete',
          data: {
            settings: {
              baseCurrency: 'CNY',
              timezone: 'Asia/Shanghai',
              defaultNotifyDays: 3,
              defaultAdvanceReminderRules: '3&09:30;0&09:30;',
              rememberSessionDays: 7,
              notifyOnDueDay: true,
              mergeMultiSubscriptionNotifications: true,
              monthlyBudgetBase: null,
              yearlyBudgetBase: null,
              enableTagBudgets: false,
              overdueReminderDays: [1, 2, 3],
              defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
              tagBudgets: {},
              emailNotificationsEnabled: false,
              emailProvider: 'smtp',
              pushplusNotificationsEnabled: false,
              telegramNotificationsEnabled: false,
              serverchanNotificationsEnabled: false,
              gotifyNotificationsEnabled: false,
              barkNotificationsEnabled: false,
              notifyxNotificationsEnabled: false,
              appriseNotificationsEnabled: false,
              smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
              resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
              pushplusConfig: { token: '', topic: '' },
              telegramConfig: { botToken: '', chatId: '' },
              serverchanConfig: { sendkey: '' },
              gotifyConfig: { url: '', token: '', ignoreSsl: false },
              barkConfig: { serverUrl: '', deviceKey: '', isArchive: false },
              notifyxConfig: { apiKey: '', team: '' },
              appriseConfig: {
                apiBaseUrl: '',
                key: '',
                ignoreSsl: false,
                targets: [],
                lastSyncStatus: 'idle',
                lastSyncAt: null,
                lastSyncError: null
              },
              aiConfig: {
                enabled: false,
                dashboardSummaryEnabled: false,
                providerPreset: 'custom',
                providerName: 'DeepSeek',
                baseUrl: 'https://api.deepseek.com',
                apiKey: '',
                model: 'deepseek-chat',
                timeoutMs: 30000,
                promptTemplate: '',
                dashboardSummaryPromptTemplate: '',
                capabilities: { vision: false, structuredOutput: true }
              }
            },
            notificationWebhook: {
              enabled: false,
              url: '',
              requestMethod: 'POST',
              headers: 'Content-Type: application/json',
              payloadTemplate: '{}',
              ignoreSsl: false
            },
            tags: [],
            subscriptions: [
              {
                id: 'sub_existing',
                name: 'Netflix',
                description: '',
                websiteUrl: 'https://netflix.com',
                logoUrl: null,
                logoSource: null,
                logoFetchedAt: null,
                status: 'active',
                amount: 15,
                currency: 'USD',
                billingIntervalCount: 1,
                billingIntervalUnit: 'month',
                autoRenew: true,
                startDate: '2026-04-01',
                nextRenewalDate: '2026-05-01',
                notifyDaysBefore: 3,
                advanceReminderRules: '3&09:30;0&09:30;',
                overdueReminderRules: '1&09:30;',
                webhookEnabled: true,
                notes: '',
                tagIds: [],
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z'
              }
            ],
            paymentRecords: [
              {
                id: 'pay_existing',
                subscriptionId: 'sub_existing',
                amount: 15,
                currency: 'USD',
                baseCurrency: 'CNY',
                convertedAmount: 108,
                exchangeRate: 7.2,
                paidAt: '2026-04-01T00:00:00.000Z',
                periodStart: '2026-04-01T00:00:00.000Z',
                periodEnd: '2026-04-30T00:00:00.000Z',
                createdAt: '2026-04-01T00:00:00.000Z'
              }
            ],
            subscriptionOrder: ['sub_existing']
          },
          assets: {
            logos: []
          }
        }),
        'utf8'
      )
    )

    mocks.prismaMock.tag.findMany.mockResolvedValue([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
    const preview = await inspectSubtrackerBackupFile({
      filename: 'backup.zip',
      contentType: 'application/zip',
      base64: inspectZip.toBuffer().toString('base64')
    })

    mocks.prismaMock.tag.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([{ id: 'sub_existing' }])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([{ id: 'pay_existing' }])

    const result = await commitSubtrackerBackup({
      importToken: preview.importToken,
      mode: 'append',
      restoreSettings: false
    })

    expect(result.importedSubscriptions).toBe(0)
    expect(result.importedPaymentRecords).toBe(0)
    expect(mocks.setSubscriptionOrderMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.paymentRecord.createMany).not.toHaveBeenCalled()
  })

  it.each([
    ['recurring', 'standard'], ['lifetime', 'standard'],
    ['recurring', 'legacy-v0.11'], ['lifetime', 'legacy-v0.11']
  ] as const)('exports %s billing type in %s format with referenced logos', async (billingType, format) => {
    mocks.getAppSettingsMock.mockResolvedValue({
      baseCurrency: 'CNY',
      timezone: 'Asia/Shanghai',
      defaultNotifyDays: 3,
      defaultAdvanceReminderRules: '3&09:30;0&09:30;',
      rememberSessionDays: 7,
      notifyOnDueDay: true,
      mergeMultiSubscriptionNotifications: true,
      monthlyBudgetBase: null,
      yearlyBudgetBase: null,
      enableTagBudgets: false,
      overdueReminderDays: [1, 2, 3],
      defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
      tagBudgets: {},
      emailNotificationsEnabled: false,
      emailProvider: 'smtp',
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false,
      barkNotificationsEnabled: false,
      notifyxNotificationsEnabled: false,
      appriseNotificationsEnabled: false,
      smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
      resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
      pushplusConfig: { token: '', topic: '' },
      telegramConfig: { botToken: '', chatId: '' },
      serverchanConfig: { sendkey: '' },
      gotifyConfig: { url: '', token: '', ignoreSsl: false },
      barkConfig: { serverUrl: '', deviceKey: '', isArchive: false },
      notifyxConfig: { apiKey: '', team: '' },
      appriseConfig: {
        apiBaseUrl: '',
        key: '',
        ignoreSsl: false,
        targets: [],
        lastSyncStatus: 'idle',
        lastSyncAt: null,
        lastSyncError: null
      },
      aiConfig: {
        enabled: false,
        dashboardSummaryEnabled: false,
        providerPreset: 'custom',
        providerName: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        timeoutMs: 30000,
        promptTemplate: '',
        dashboardSummaryPromptTemplate: '',
        capabilities: { vision: false, structuredOutput: true }
      }
    })
    mocks.getPrimaryWebhookEndpointMock.mockResolvedValue({
      enabled: true,
      url: 'https://example.com/hook',
      requestMethod: 'POST',
      headers: 'Content-Type: application/json',
      payloadTemplate: '{}',
      ignoreSsl: false
    })
    mocks.getSubscriptionOrderMock.mockResolvedValue(['sub_1'])
    mocks.prismaMock.tag.findMany.mockResolvedValue([
      { id: 'tag_1', name: '影音', color: '#3b82f6', icon: 'apps-outline', sortOrder: 1 }
    ])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([
      {
        id: 'sub_1',
        billingType,
        name: 'Netflix',
        description: 'Streaming',
        websiteUrl: 'https://netflix.com',
        logoUrl: '/static/logos/netflix.png',
        logoSource: 'upload',
        logoFetchedAt: new Date('2026-04-01T00:00:00.000Z'),
        status: 'active',
        amount: 15,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        autoRenew: true,
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-05-01T00:00:00.000Z'),
        notifyDaysBefore: 3,
        advanceReminderRules: '3&09:30;0&09:30;',
        overdueReminderRules: '1&09:30;',
        webhookEnabled: true,
        notes: '',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
        tags: [{ tagId: 'tag_1' }]
      }
    ])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([
      {
        id: 'pay_1',
        subscriptionId: 'sub_1',
        amount: 15,
        currency: 'USD',
        baseCurrency: 'CNY',
        convertedAmount: 108,
        exchangeRate: 7.2,
        paidAt: new Date('2026-04-01T00:00:00.000Z'),
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        periodEnd: new Date('2026-04-30T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z')
      }
    ])
    mocks.prismaMock.subscriptionImage.findMany.mockResolvedValue([{
      id: 'image_1', subscriptionId: 'sub_1', fileName: 'receipt.png', storageName: 'image_1.png',
      contentType: 'image/png', size: 10, createdAt: new Date('2026-04-01T00:00:00Z')
    }])
    mocks.getLocalLogoLibraryMock.mockResolvedValue([
      { logoUrl: '/static/logos/netflix.png' },
      ...additionalLogos.map(({ extension }) => ({ logoUrl: `/static/logos/extra${extension}` }))
    ])
    await writeFile(path.join(fixtureRoot, 'logos', 'netflix.png'), Buffer.from('fake-image'))
    await writeFile(path.join(fixtureRoot, 'images', 'image_1.png'), Buffer.from('fake-image'))
    for (const { extension, buffer } of additionalLogos) await writeFile(path.join(fixtureRoot, 'logos', `extra${extension}`), buffer)

    const legacy = format === 'legacy-v0.11'
    const result = await createSubtrackerBackupArchive(true, format)

    expect(result.filename).toBe(`subtracker-backup-2026-05-02T16-00-00${legacy ? '-compatible-v0.11' : ''}.zip`)
    const bytes = await collectBuffer(result.stream)
    if (legacy) {
      expect(bytes.length).toBeLessThanOrEqual(750 * 1024)
      expect(Buffer.byteLength(JSON.stringify({ filename: result.filename, contentType: result.contentType, base64: bytes.toString('base64') }))).toBeLessThan(1024 * 1024)
    }
    const zip = new AdmZip(bytes)
    const entries = zip.getEntries().map((entry) => entry.entryName)
    expect(entries).toContain('manifest.json')
    expect(entries).toContain('logos/netflix.png')
    if (legacy) {
      expect(entries.some(name => name.startsWith('subscription-images/'))).toBe(false)
      expect(mocks.prismaMock.subscriptionImage.findMany).not.toHaveBeenCalled()
    } else {
      expect(entries).toContain('subscription-images/image_1.png')
      expect(mocks.prismaMock.subscriptionImage.findMany).toHaveBeenCalledWith({
        where: { subscriptionId: { not: null } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      })
    }
    const manifest = JSON.parse(
      zip.getEntries().find((entry) => entry.entryName === 'manifest.json')!.getData().toString('utf8')
    )
    expect(manifest.schemaVersion).toBe(legacy ? 1 : 2)
    expect(manifest.includesSubscriptionImages).toBe(!legacy)
    expect(manifest.assets.subscriptionImages).toEqual(legacy ? undefined : [{
      id: 'image_1', subscriptionId: 'sub_1', fileName: 'receipt.png', path: 'subscription-images/image_1.png',
      contentType: 'image/png', size: 10, createdAt: '2026-04-01T00:00:00.000Z'
    }])
    expect(manifest.data.subscriptions).toHaveLength(1)
    expect(manifest.data.subscriptions[0].billingType).toBe(billingType)
    expect(manifest.assets.logos[0]).toMatchObject({
      path: 'logos/netflix.png',
      sourceLogoUrl: '/static/logos/netflix.png'
    })
    for (const { extension, contentType, buffer } of additionalLogos) {
      expect(manifest.assets.logos).toContainEqual(expect.objectContaining({
        path: `logos/extra${extension}`, contentType, sourceLogoUrl: `/static/logos/extra${extension}`
      }))
      expect(zip.getEntries().find(entry => entry.entryName === `logos/extra${extension}`)!.getData()).toEqual(buffer)
    }
    expect(manifest.data.notificationWebhook.url).toBe('https://example.com/hook')
  })

  it('inspects a valid backup zip and returns append/replace preview', async () => {
    const zip = new AdmZip()
    zip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          exportedAt: '2026-05-02T08:00:00.000Z',
          app: 'SubTracker',
          scope: 'business-complete',
          data: {
            settings: {
              baseCurrency: 'CNY',
              timezone: 'Asia/Shanghai',
              defaultNotifyDays: 3,
              defaultAdvanceReminderRules: '3&09:30;0&09:30;',
              rememberSessionDays: 7,
              notifyOnDueDay: true,
              mergeMultiSubscriptionNotifications: true,
              monthlyBudgetBase: null,
              yearlyBudgetBase: null,
              enableTagBudgets: false,
              overdueReminderDays: [1, 2, 3],
              defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
              tagBudgets: {},
              emailNotificationsEnabled: false,
              emailProvider: 'smtp',
              pushplusNotificationsEnabled: false,
              telegramNotificationsEnabled: false,
              serverchanNotificationsEnabled: false,
              gotifyNotificationsEnabled: false,
              barkNotificationsEnabled: false,
              notifyxNotificationsEnabled: false,
              appriseNotificationsEnabled: false,
              smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
              resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
              pushplusConfig: { token: '', topic: '' },
              telegramConfig: { botToken: '', chatId: '' },
              serverchanConfig: { sendkey: '' },
              gotifyConfig: { url: '', token: '', ignoreSsl: false },
              barkConfig: { serverUrl: '', deviceKey: '', isArchive: false },
              notifyxConfig: { apiKey: '', team: '' },
              appriseConfig: {
                apiBaseUrl: '',
                key: '',
                ignoreSsl: false,
                targets: [],
                lastSyncStatus: 'idle',
                lastSyncAt: null,
                lastSyncError: null
              },
              aiConfig: {
                enabled: false,
                dashboardSummaryEnabled: false,
                providerPreset: 'custom',
                providerName: 'DeepSeek',
                baseUrl: 'https://api.deepseek.com',
                apiKey: '',
                model: 'deepseek-chat',
                timeoutMs: 30000,
                promptTemplate: '',
                dashboardSummaryPromptTemplate: '',
                capabilities: { vision: false, structuredOutput: true }
              }
            },
            notificationWebhook: {
              enabled: false,
              url: '',
              requestMethod: 'POST',
              headers: 'Content-Type: application/json',
              payloadTemplate: '{}',
              ignoreSsl: false
            },
            tags: [{ id: 'tag_1', name: '影音', color: '#3b82f6', icon: 'apps-outline', sortOrder: 1 }],
            subscriptions: [
              {
                id: 'sub_1',
                name: 'Netflix',
                description: '',
                websiteUrl: 'https://netflix.com',
                logoUrl: '/static/logos/netflix.png',
                logoSource: 'upload',
                logoFetchedAt: null,
                status: 'active',
                amount: 15,
                currency: 'USD',
                billingIntervalCount: 1,
                billingIntervalUnit: 'month',
                autoRenew: true,
                startDate: '2026-04-01',
                nextRenewalDate: '2026-05-01',
                notifyDaysBefore: 3,
                advanceReminderRules: '3&09:30;0&09:30;',
                overdueReminderRules: '1&09:30;',
                webhookEnabled: true,
                notes: '',
                tagIds: ['tag_1'],
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z'
              }
            ],
            paymentRecords: [],
            subscriptionOrder: ['sub_1']
          },
          assets: {
            logos: [
              {
                path: 'logos/netflix.png',
                filename: 'netflix.png',
                sourceLogoUrl: '/static/logos/netflix.png',
                contentType: 'image/png',
                referencedBySubscriptionIds: ['sub_1']
              }
            ]
          }
        }),
        'utf8'
      )
    )
    zip.addFile('logos/netflix.png', Buffer.from('fake-image'))

    mocks.prismaMock.tag.findMany.mockResolvedValue([{ name: '影音' }])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([{ id: 'sub_1' }])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])

    const preview = await inspectSubtrackerBackupFile({
      filename: 'backup.zip',
      contentType: 'application/zip',
      base64: zip.toBuffer().toString('base64')
    })

    expect(preview.isSubtrackerBackup).toBe(true)
    expect(preview.availableModes).toEqual(['replace', 'append'])
    expect(preview.conflicts).toMatchObject({
      existingTagNameCount: 1,
      existingSubscriptionIdCount: 1
    })
  })
})
