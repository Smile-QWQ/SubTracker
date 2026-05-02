import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPreparedSubtrackerBackupPayload } from '@/utils/subtracker-backup-client'

const { unzipSyncMock } = vi.hoisted(() => ({
  unzipSyncMock: vi.fn<(bytes: Uint8Array) => Record<string, Uint8Array>>()
}))

vi.mock('fflate', async () => {
  const actual = await vi.importActual<typeof import('fflate')>('fflate')
  return {
    ...actual,
    unzipSync: unzipSyncMock
  }
})

function createFile(name = 'subtracker-backup.zip') {
  return {
    name,
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3]).buffer
    }
  } as unknown as File
}

describe('buildPreparedSubtrackerBackupPayload', () => {
  beforeEach(() => {
    unzipSyncMock.mockReset()
  })

  it('parses a valid backup zip into manifest and logo assets', async () => {
    const manifest = {
      schemaVersion: 1,
      exportedAt: '2026-05-02T12:08:16Z',
      app: 'SubTracker',
      scope: 'business-complete',
      data: {
        settings: {},
        notificationWebhook: {},
        tags: [],
        subscriptions: [],
        paymentRecords: [],
        subscriptionOrder: []
      },
      assets: {
        logos: [
          {
            path: 'logos/test.png',
            filename: 'test.png',
            sourceLogoUrl: '/static/logos/test.png',
            contentType: 'image/png',
            referencedBySubscriptionIds: []
          }
        ]
      }
    }

    unzipSyncMock.mockReturnValue({
      'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
      'logos/test.png': Uint8Array.from([137, 80, 78, 71])
    })

    const file = createFile()

    const prepared = await buildPreparedSubtrackerBackupPayload(file)

    expect((prepared.manifest as { app: string }).app).toBe('SubTracker')
    expect(prepared.logoAssets).toHaveLength(1)
    expect(prepared.logoAssets[0]).toMatchObject({
      path: 'logos/test.png',
      filename: 'test.png',
      contentType: 'image/png'
    })
  })

  it('throws a friendly error when manifest is missing', async () => {
    unzipSyncMock.mockReturnValue({
      'logos/test.png': Uint8Array.from([137, 80, 78, 71])
    })

    const file = createFile('broken.zip')

    await expect(buildPreparedSubtrackerBackupPayload(file)).rejects.toThrow('备份 ZIP 缺少 manifest.json')
  })
})
