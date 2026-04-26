import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationDelivery = {
  create: vi.fn(),
  deleteMany: vi.fn()
}

const importPreview = {
  upsert: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn()
}

vi.mock('../../src/db', () => ({
  prisma: {
    notificationDelivery,
    importPreview
  }
}))

vi.mock('../../src/runtime', () => ({
  getRuntimeD1Database: vi.fn(() => undefined),
  isWorkerRuntime: vi.fn(() => false)
}))

describe('worker-lite state service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats unique notification-delivery conflicts as already claimed', async () => {
    const { Prisma } = await import('@prisma/client')
    const { claimNotificationDelivery } = await import('../../src/services/worker-lite-state.service')

    notificationDelivery.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test'
      })
    )

    await expect(
      claimNotificationDelivery({
        channel: 'email',
        eventType: 'subscription.reminder_due',
        resourceKey: 'subscription:1',
        periodKey: '2026-04-23:upcoming'
      })
    ).resolves.toBe(false)
  })

  it('expires stored import previews on read', async () => {
    const { getImportPreview } = await import('../../src/services/worker-lite-state.service')

    importPreview.findUnique.mockResolvedValueOnce({
      token: 'preview-token',
      previewJson: { importToken: 'preview-token' },
      expiresAt: new Date(Date.now() - 1000)
    })

    await expect(getImportPreview('preview-token')).resolves.toBeNull()
    expect(importPreview.deleteMany).toHaveBeenCalledWith({
      where: { token: 'preview-token' }
    })
  })

  it('stores import previews in database-backed state when KV is not used', async () => {
    const { storeImportPreview, getImportPreview, deleteImportPreview } = await import('../../src/services/worker-lite-state.service')

    importPreview.findUnique.mockResolvedValueOnce({
      token: 'preview-token',
      previewJson: { preview: true },
      expiresAt: new Date(Date.now() + 60_000)
    })

    await storeImportPreview('preview-token', { preview: true }, 60_000)
    await expect(getImportPreview('preview-token')).resolves.toEqual({ preview: true })
    await deleteImportPreview('preview-token')

    expect(importPreview.upsert).toHaveBeenCalledWith({
      where: { token: 'preview-token' },
      update: expect.objectContaining({
        previewJson: { preview: true }
      }),
      create: expect.objectContaining({
        token: 'preview-token',
        previewJson: { preview: true }
      })
    })
    expect(importPreview.findUnique).toHaveBeenCalledWith({
      where: { token: 'preview-token' }
    })
    expect(importPreview.deleteMany).toHaveBeenCalledWith({
      where: { token: 'preview-token' }
    })
  })
})
