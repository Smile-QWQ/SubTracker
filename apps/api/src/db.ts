import { PrismaClient } from '@prisma/client'
import { getRuntimePrisma } from './runtime'

let fallbackPrisma: PrismaClient | null = null

function resolvePrismaClient() {
  try {
    return getRuntimePrisma()
  } catch {
    if (!fallbackPrisma) {
      fallbackPrisma = new PrismaClient()
    }
    return fallbackPrisma
  }
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolvePrismaClient() as unknown as Record<PropertyKey, unknown>
    const value = client[property]
    return typeof value === 'function' ? value.bind(client) : value
  }
})
