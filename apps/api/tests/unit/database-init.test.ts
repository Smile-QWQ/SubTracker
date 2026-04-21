import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { D1Database, D1PreparedStatement } from '../../src/worker/types'

function createPreparedStatement(query: string): D1PreparedStatement & { query: string } {
  return {
    query,
    bind() {
      return this
    },
    async all() {
      return { results: [] }
    },
    async first() {
      return null
    },
    async run() {
      return {}
    }
  }
}

describe('ensureDatabaseInitialized', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('splits schema into complete D1 statements instead of exec a multiline blob', async () => {
    const preparedQueries: string[] = []
    const db: D1Database = {
      prepare(query: string) {
        preparedQueries.push(query)
        return createPreparedStatement(query)
      },
      async exec() {
        throw new Error('should not call db.exec with schema blob')
      },
      async batch(statements) {
        expect(statements.length).toBeGreaterThan(5)
        return []
      }
    }

    const { ensureDatabaseInitialized } = await import('../../src/worker/database-init')

    await ensureDatabaseInitialized(db)

    expect(preparedQueries[0]).toContain('CREATE TABLE IF NOT EXISTS "Tag"')
    expect(preparedQueries[0].trim().endsWith(')')).toBe(true)
    expect(preparedQueries.some((query) => query.includes('CREATE TABLE IF NOT EXISTS "Setting"'))).toBe(true)
  })

  it('does not cache a rejected initialization forever and retries on next call', async () => {
    const firstDbCalls: string[] = []
    const retryDbCalls: string[] = []

    const firstDb: D1Database = {
      prepare(query: string) {
        firstDbCalls.push(query)
        return createPreparedStatement(query)
      },
      async exec() {
        throw new Error('should not call db.exec with schema blob')
      },
      async batch() {
        throw new Error('init failed once')
      }
    }

    const retryDb: D1Database = {
      prepare(query: string) {
        retryDbCalls.push(query)
        return createPreparedStatement(query)
      },
      async exec() {
        throw new Error('should not call db.exec with schema blob')
      },
      async batch() {
        return []
      }
    }

    const { ensureDatabaseInitialized } = await import('../../src/worker/database-init')

    await expect(ensureDatabaseInitialized(firstDb)).rejects.toThrow('init failed once')
    await expect(ensureDatabaseInitialized(retryDb)).resolves.toBeUndefined()

    expect(firstDbCalls.length).toBeGreaterThan(0)
    expect(retryDbCalls.length).toBeGreaterThan(0)
  })
})
