import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import type { Prisma } from '@prisma/client'

const mocks = vi.hoisted(() => {
  const tx = { subscriptionImage: { findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() } }
  return { tx, transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)), unlink: vi.fn() }
})
vi.mock('../../src/db', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(), unlink: mocks.unlink
}))
import {
  cleanupPendingSubscriptionImages, deletePendingSubscriptionImage, getSubscriptionImageStorageDir, replaceSubscriptionImages
} from '../../src/services/subscription-images.service'

const tx = mocks.tx as unknown as Prisma.TransactionClient
const image = { id: 'image', storageName: 'safe.png', subscriptionId: null }

describe('subscription image storage directory', () => {
  const apiRoot = fileURLToPath(new URL('../../', import.meta.url))
  const expected = path.join(apiRoot, 'storage/subscription-images')

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    ['repository root', path.resolve(apiRoot, '../..')],
    ['API workspace', path.resolve(apiRoot)],
    ['unrelated directory', tmpdir()]
  ])('uses the same default when launched from the %s', (_name, cwd) => {
    vi.stubEnv('SUBSCRIPTION_IMAGE_STORAGE_DIR', undefined)
    vi.spyOn(process, 'cwd').mockReturnValue(cwd)
    expect(getSubscriptionImageStorageDir()).toBe(expected)
  })

  it('keeps an explicitly configured absolute directory, including Docker data mounts', () => {
    const configured = path.resolve('/app/data/subscription-images')
    vi.stubEnv('SUBSCRIPTION_IMAGE_STORAGE_DIR', configured)
    vi.spyOn(process, 'cwd').mockReturnValue(tmpdir())
    expect(getSubscriptionImageStorageDir()).toBe(configured)
  })

  it('preserves the existing cwd-relative behavior of explicit relative overrides', () => {
    vi.stubEnv('SUBSCRIPTION_IMAGE_STORAGE_DIR', 'custom-images')
    vi.spyOn(process, 'cwd').mockReturnValue(tmpdir())
    expect(getSubscriptionImageStorageDir()).toBe(path.join(tmpdir(), 'custom-images'))
  })

  it('uses the stable default for an empty override', () => {
    vi.stubEnv('SUBSCRIPTION_IMAGE_STORAGE_DIR', '')
    vi.spyOn(process, 'cwd').mockReturnValue(tmpdir())
    expect(getSubscriptionImageStorageDir()).toBe(expected)
  })
})

describe('subscription-images transactional claims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tx.subscriptionImage.findMany.mockResolvedValue([])
    mocks.tx.subscriptionImage.findUnique.mockResolvedValue(image)
    mocks.tx.subscriptionImage.deleteMany.mockResolvedValue({ count: 1 })
    mocks.tx.subscriptionImage.updateMany.mockResolvedValue({ count: 1 })
    mocks.unlink.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx))
  })

  it('lazy cleanup only unlinks rows claimed with a pending/age predicate inside its transaction', async () => {
    const now = new Date('2026-06-02T12:00:00Z')
    const cutoff = new Date('2026-06-01T12:00:00Z')
    mocks.tx.subscriptionImage.findMany.mockResolvedValue([image, { ...image, id: 'raced', storageName: 'raced.png' }])
    mocks.tx.subscriptionImage.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await cleanupPendingSubscriptionImages(now)
    expect(mocks.tx.subscriptionImage.findMany).toHaveBeenCalledWith({
      where: { subscriptionId: null, createdAt: { lt: cutoff } }, select: { id: true, storageName: true }
    })
    expect(mocks.tx.subscriptionImage.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'raced', subscriptionId: null, createdAt: { lt: cutoff } }
    })
    expect(mocks.unlink).toHaveBeenCalledTimes(1)
    expect(mocks.unlink.mock.calls[0][0]).toMatch(/safe\.png$/)
  })

  it('does not unlink a row if the cleanup transaction rolls back after its claim', async () => {
    mocks.tx.subscriptionImage.findMany.mockResolvedValue([image])
    mocks.transaction.mockImplementationOnce(async (callback) => {
      await callback(mocks.tx)
      expect(mocks.unlink).not.toHaveBeenCalled()
      throw new Error('rollback')
    })
    await expect(cleanupPendingSubscriptionImages()).rejects.toThrow('rollback')
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  it('cancel compares-and-deletes only pending images and never unlinks a lost claim', async () => {
    mocks.tx.subscriptionImage.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deletePendingSubscriptionImage('image')).rejects.toThrow('invalidSelection')
    expect(mocks.tx.subscriptionImage.deleteMany).toHaveBeenCalledWith({ where: { id: 'image', subscriptionId: null } })
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  it('cancel only unlinks after commit; rollback retains the file', async () => {
    mocks.transaction.mockImplementationOnce(async (callback) => {
      await callback(mocks.tx)
      expect(mocks.unlink).not.toHaveBeenCalled()
      throw new Error('rollback')
    })
    await expect(deletePendingSubscriptionImage('image')).rejects.toThrow('rollback')
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  it('attach requires every selection to be pending or already owned by the same subscription', async () => {
    mocks.tx.subscriptionImage.updateMany.mockResolvedValueOnce({ count: 1 })
    await expect(replaceSubscriptionImages(tx, 'sub', ['pending', 'foreign'])).rejects.toThrow('invalidSelection')
    expect(mocks.tx.subscriptionImage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['pending', 'foreign'] }, OR: [{ subscriptionId: null }, { subscriptionId: 'sub' }] },
      data: { subscriptionId: 'sub' }
    })
    expect(mocks.tx.subscriptionImage.deleteMany).not.toHaveBeenCalled()
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  it('returns removed storage names without unlinking from inside the subscription transaction', async () => {
    mocks.tx.subscriptionImage.findMany.mockResolvedValue([image])
    await expect(replaceSubscriptionImages(tx, 'sub', ['kept'])).resolves.toEqual(['safe.png'])
    expect(mocks.tx.subscriptionImage.deleteMany).toHaveBeenCalledWith({
      where: { subscriptionId: 'sub', id: { notIn: ['kept'] } }
    })
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  it('enforces the count and uniqueness limits at the service boundary too', async () => {
    await expect(replaceSubscriptionImages(tx, 'sub', Array.from({ length: 21 }, (_, i) => `id${i}`))).rejects.toThrow('limitExceeded')
    await expect(replaceSubscriptionImages(tx, 'sub', ['same', 'same'])).rejects.toThrow('invalidSelection')
    expect(mocks.tx.subscriptionImage.updateMany).not.toHaveBeenCalled()
  })
})
