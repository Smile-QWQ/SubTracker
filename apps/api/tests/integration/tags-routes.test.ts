import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('../../src/db', () => ({ prisma: { tag: { findMany: mocks.findMany } } }))
import { tagRoutes } from '../../src/routes/tags'

describe('tag subscription counts', () => {
  it('returns all relation counts including empty tags without applying subscription filters', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'tools', name: 'Tools', _count: { subscriptionTags: 5 } },
      { id: 'cloud', name: 'Cloud', _count: { subscriptionTags: 2 } },
      { id: 'empty', name: 'Empty', _count: { subscriptionTags: 0 } }
    ])
    const app = Fastify()
    await app.register(tagRoutes)
    try {
      const response = await app.inject({ method: 'GET', url: '/tags?tagIds=tools&status=active&q=test' })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toEqual([
        { id: 'tools', name: 'Tools', subscriptionCount: 5 },
        { id: 'cloud', name: 'Cloud', subscriptionCount: 2 },
        { id: 'empty', name: 'Empty', subscriptionCount: 0 }
      ])
      expect(mocks.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { subscriptionTags: true } } }
      })
    } finally {
      await app.close()
    }
  })
})
