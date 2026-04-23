import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tagRouteMocks = vi.hoisted(() => ({
  prisma: {
    subscriptionTag: {
      deleteMany: vi.fn(async () => ({ count: 1 }))
    },
    tag: {
      findMany: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(async () => ({ id: 'cksubtracker0000000000000tag1' }))
    }
  }
}))

vi.mock('../../src/db', () => ({
  prisma: tagRouteMocks.prisma
}))

describe('tag routes D1 compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('deletes tags without Prisma interactive transactions', async () => {
    const { tagRoutes } = await import('../../src/routes/tags')
    const app = Fastify()
    await tagRoutes(app)

    const response = await app.inject({
      method: 'DELETE',
      url: '/tags/cksubtracker0000000000000tag1'
    })

    expect(response.statusCode).toBe(200)
    expect(tagRouteMocks.prisma.subscriptionTag.deleteMany).toHaveBeenCalledWith({
      where: { tagId: 'cksubtracker0000000000000tag1' }
    })
    expect(tagRouteMocks.prisma.tag.delete).toHaveBeenCalledWith({
      where: { id: 'cksubtracker0000000000000tag1' }
    })

    await app.close()
  })
})
