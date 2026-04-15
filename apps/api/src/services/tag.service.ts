import type { Prisma, PrismaClient } from '@prisma/client'

type DbClient = Prisma.TransactionClient | PrismaClient

export function normalizeTagIds(tagIds?: string[] | null) {
  return Array.from(new Set((tagIds ?? []).filter(Boolean)))
}

export async function replaceSubscriptionTags(db: DbClient, subscriptionId: string, tagIds: string[]) {
  await db.subscriptionTag.deleteMany({
    where: { subscriptionId }
  })

  if (tagIds.length === 0) return

  await db.subscriptionTag.createMany({
    data: tagIds.map((tagId) => ({
      subscriptionId,
      tagId
    }))
  })
}

export function flattenSubscriptionTags<
  T extends {
    tags?: Array<{ tag: { id: string; name: string; color: string; icon: string; sortOrder: number } }>
  }
>(row: T) {
  return {
    ...row,
    tags: (row.tags ?? []).map((item) => item.tag)
  }
}
