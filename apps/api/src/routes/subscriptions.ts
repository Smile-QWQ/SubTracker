import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendCreated, sendError, sendOk } from '../http'
import {
  CreateSubscriptionSchema,
  LogoSearchSchema,
  LogoUploadSchema,
  RenewSubscriptionSchema,
  UpdateSubscriptionSchema
} from '@subtracker/shared'
import {
  appendSubscriptionOrder,
  removeSubscriptionOrder,
  setSubscriptionOrder,
  sortSubscriptionsByOrder
} from '../services/subscription-order.service'
import { invalidateWorkerLiteCache, withWorkerLiteCache } from '../services/worker-lite-cache.service'
import { listSubscriptionsLite } from '../services/worker-lite-repository.service'
import { renewSubscription } from '../services/subscription.service'
import { flattenSubscriptionTags, normalizeTagIds, replaceSubscriptionTags } from '../services/tag.service'
import {
  deleteLocalLogoFromLibrary,
  getLocalLogoLibrary,
  importRemoteLogo,
  normalizeLogoForStorage,
  saveUploadedLogo,
  searchSubscriptionLogos
} from '../services/logo.service'
import { getAppTimezone, getDefaultAdvanceReminderRulesSetting } from '../services/settings.service'
import {
  buildAdvanceReminderRulesFromLegacyWithDefault,
  deriveNotifyDaysBeforeFromAdvanceRules,
  normalizeOptionalReminderRules
} from '../services/reminder-rules.service'
import { parseDateInTimezone } from '../utils/timezone'

const subscriptionInclude = {
  tags: { include: { tag: true } }
} as const

async function fetchSubscriptionWithTags(id: string) {
  return prisma.subscription.findUniqueOrThrow({
    where: { id },
    include: subscriptionInclude
  })
}

async function resolveSubscriptionReminderFields(payload: {
  advanceReminderRules?: string | null
  overdueReminderRules?: string | null
  notifyDaysBefore?: number
}) {
  const defaultAdvanceReminderRules = await getDefaultAdvanceReminderRulesSetting()

  const normalizedAdvanceReminderRules =
    payload.advanceReminderRules !== undefined
      ? normalizeOptionalReminderRules(payload.advanceReminderRules, 'advance')
      : payload.notifyDaysBefore !== undefined
        ? buildAdvanceReminderRulesFromLegacyWithDefault(payload.notifyDaysBefore, defaultAdvanceReminderRules)
        : undefined

  const normalizedOverdueReminderRules =
    payload.overdueReminderRules !== undefined
      ? normalizeOptionalReminderRules(payload.overdueReminderRules, 'overdue')
      : undefined

  const derivedNotifyDaysBefore =
    normalizedAdvanceReminderRules !== undefined
      ? deriveNotifyDaysBeforeFromAdvanceRules(normalizedAdvanceReminderRules || defaultAdvanceReminderRules)
      : payload.notifyDaysBefore

  return {
    advanceReminderRules: normalizedAdvanceReminderRules,
    overdueReminderRules: normalizedOverdueReminderRules,
    notifyDaysBefore: derivedNotifyDaysBefore
  }
}

function parseBatchIds(input: unknown) {
  return z
    .object({
      ids: z.array(z.string()).min(1)
    })
    .safeParse(input)
}

async function runBatchAction(
  ids: string[],
  action: (id: string) => Promise<void>,
  options?: {
    validate?: (rows: Array<{ id: string; status: string }>) => string | null
  }
) {
  const rows = await prisma.subscription.findMany({
    where: {
      id: { in: ids }
    },
    select: {
      id: true,
      status: true
    }
  })

  if (rows.length !== ids.length) {
    const existing = new Set(rows.map((item) => item.id))
    const missingId = ids.find((id) => !existing.has(id))
    return {
      successCount: 0,
      failureCount: 1,
      failures: [
        {
          id: missingId ?? 'unknown',
          message: 'Subscription not found'
        }
      ]
    }
  }

  const validationError = options?.validate?.(rows)
  if (validationError) {
    return {
      successCount: 0,
      failureCount: ids.length,
      failures: ids.map((id) => ({
        id,
        message: validationError
      }))
    }
  }

  const failures: Array<{ id: string; message: string }> = []
  let successCount = 0

  for (const id of ids) {
    try {
      await action(id)
      successCount += 1
    } catch (error) {
      failures.push({
        id,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return {
    successCount,
    failureCount: failures.length,
    failures
  }
}

export async function subscriptionRoutes(app: FastifyInstance) {
  app.post('/subscriptions/logo/search', async (request, reply) => {
    const parsed = LogoSearchSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid logo search payload', parsed.error.flatten())
    }

    return sendOk(reply, await searchSubscriptionLogos(parsed.data))
  })

  app.get('/subscriptions/logo/library', async (_request, reply) => {
    return sendOk(reply, await getLocalLogoLibrary())
  })

  app.delete('/subscriptions/logo/library/:filename', async (request, reply) => {
    const parsed = z.object({ filename: z.string().min(1).max(255) }).safeParse(request.params)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid logo filename', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await deleteLocalLogoFromLibrary(parsed.data.filename))
    } catch (error) {
      return sendError(reply, 400, 'logo_delete_failed', error instanceof Error ? error.message : 'Logo delete failed')
    }
  })

  app.post('/subscriptions/logo/upload', async (request, reply) => {
    const parsed = LogoUploadSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid logo upload payload', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await saveUploadedLogo(parsed.data))
    } catch (error) {
      return sendError(reply, 400, 'logo_upload_failed', error instanceof Error ? error.message : 'Logo upload failed')
    }
  })

  app.post('/subscriptions/logo/import', async (request, reply) => {
    const parsed = z.object({
      logoUrl: z.string().url(),
      source: z.string().max(100).optional()
    }).safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid logo import payload', parsed.error.flatten())
    }

    try {
      return sendOk(reply, await importRemoteLogo(parsed.data))
    } catch (error) {
      return sendError(reply, 400, 'logo_import_failed', error instanceof Error ? error.message : 'Logo import failed')
    }
  })

  app.get('/subscriptions', async (request, reply) => {
    const querySchema = z.object({
      q: z.string().optional(),
      status: z.string().optional(),
      tagIds: z.string().optional()
    })

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid query', parsed.error.flatten())
    }

    const where: Record<string, unknown> = {}
    if (parsed.data.q) {
      where.OR = [{ name: { contains: parsed.data.q } }, { description: { contains: parsed.data.q } }]
    }
    if (parsed.data.status) {
      where.status = parsed.data.status
    }
    if (parsed.data.tagIds) {
      const tagIds = normalizeTagIds(
        parsed.data.tagIds
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
      if (tagIds.length > 0) {
        where.tags = {
          some: {
            tagId: { in: tagIds }
          }
        }
      }
    }

    const cacheKey = JSON.stringify({
      q: parsed.data.q ?? '',
      status: parsed.data.status ?? '',
      tagIds: parsed.data.tagIds ?? ''
    })

    const rows = await withWorkerLiteCache(
      'subscriptions',
      cacheKey,
      async () =>
        listSubscriptionsLite({
          q: parsed.data.q,
          status: parsed.data.status,
          tagIds: parsed.data.tagIds
            ? normalizeTagIds(
                parsed.data.tagIds
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean)
              )
            : undefined
        }),
      30
    )

    return sendOk(reply, await sortSubscriptionsByOrder(rows.map(flattenSubscriptionTags)))
  })

  app.post('/subscriptions/reorder', async (request, reply) => {
    const parsed = z.object({
      ids: z.array(z.string()).min(1)
    }).safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid reorder payload', parsed.error.flatten())
    }

    await setSubscriptionOrder(parsed.data.ids)
    await invalidateWorkerLiteCache(['subscriptions'])
    return sendOk(reply, { success: true })
  })

  app.post('/subscriptions/batch/renew', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid batch renew payload', parsed.error.flatten())
    }

    const result = await runBatchAction(parsed.data.ids, async (id) => {
      await renewSubscription(id)
    })
    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar', 'exchange-rates'])

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/pause', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid batch pause payload', parsed.error.flatten())
    }

    const result = await runBatchAction(
      parsed.data.ids,
      async (id) => {
        await prisma.subscription.update({
          where: { id },
          data: { status: 'paused' }
        })
      },
      {
        validate: (rows) =>
          rows.some((row) => row.status !== 'active') ? 'Only active subscriptions can be paused in batch mode' : null
      }
    )
    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/cancel', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid batch cancel payload', parsed.error.flatten())
    }

    const result = await runBatchAction(
      parsed.data.ids,
      async (id) => {
        await prisma.subscription.update({
          where: { id },
          data: { status: 'cancelled' }
        })
      },
      {
        validate: (rows) =>
          rows.some((row) => row.status !== 'active') ? 'Only active subscriptions can be cancelled in batch mode' : null
      }
    )
    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/delete', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid batch delete payload', parsed.error.flatten())
    }

    const result = await runBatchAction(
      parsed.data.ids,
      async (id) => {
        await prisma.subscription.delete({
          where: { id }
        })
        await removeSubscriptionOrder(id)
      },
      {
        validate: (rows) =>
          rows.some((row) => row.status === 'active') ? 'Active subscriptions cannot be deleted in batch mode' : null
      }
    )

    if (result.failureCount > 0 && result.successCount === 0) {
      return sendError(reply, 422, 'batch_delete_not_allowed', result.failures[0]?.message ?? 'Batch delete failed', result)
    }

    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])
    return sendOk(reply, result)
  })

  app.get('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const row = await prisma.subscription.findUnique({
      where: { id: params.data.id },
      include: subscriptionInclude
    })

    if (!row) {
      return sendError(reply, 404, 'not_found', 'Subscription not found')
    }

    return sendOk(reply, flattenSubscriptionTags(row))
  })

  app.get('/subscriptions/:id/payment-records', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const records = await prisma.paymentRecord.findMany({
      where: { subscriptionId: params.data.id },
      orderBy: { paidAt: 'desc' }
    })

    return sendOk(reply, records)
  })

  app.post('/subscriptions', async (request, reply) => {
    const parsed = CreateSubscriptionSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription payload', parsed.error.flatten())
    }

    let normalizedLogo
    try {
      normalizedLogo = await normalizeLogoForStorage({
        logoUrl: parsed.data.logoUrl ?? null,
        logoSource: parsed.data.logoSource ?? null
      })
    } catch (error) {
      return sendError(reply, 400, 'logo_import_failed', error instanceof Error ? error.message : 'Logo import failed')
    }

    const tagIds = normalizeTagIds(parsed.data.tagIds)
    let reminderFields: Awaited<ReturnType<typeof resolveSubscriptionReminderFields>>

    try {
      reminderFields = await resolveSubscriptionReminderFields(parsed.data)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'Invalid reminder rules')
    }

    const timezone = await getAppTimezone()

    const subscription = await prisma.subscription.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billingIntervalCount: parsed.data.billingIntervalCount,
        billingIntervalUnit: parsed.data.billingIntervalUnit,
        autoRenew: parsed.data.autoRenew,
        startDate: parseDateInTimezone(parsed.data.startDate, timezone),
        nextRenewalDate: parseDateInTimezone(parsed.data.nextRenewalDate, timezone),
        notifyDaysBefore: reminderFields.notifyDaysBefore ?? parsed.data.notifyDaysBefore,
        ...(reminderFields.advanceReminderRules !== undefined
          ? { advanceReminderRules: reminderFields.advanceReminderRules }
          : {}),
        ...(reminderFields.overdueReminderRules !== undefined
          ? { overdueReminderRules: reminderFields.overdueReminderRules }
          : {}),
        webhookEnabled: parsed.data.webhookEnabled,
        notes: parsed.data.notes,
        websiteUrl: parsed.data.websiteUrl ?? null,
        logoUrl: normalizedLogo.logoUrl,
        logoSource: normalizedLogo.logoSource,
        logoFetchedAt: normalizedLogo.logoFetchedAt
      }
    })

    await replaceSubscriptionTags(prisma, subscription.id, tagIds)
    const created = await fetchSubscriptionWithTags(subscription.id)

    await appendSubscriptionOrder(created.id)
    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])
    return sendCreated(reply, flattenSubscriptionTags(created))
  })

  app.patch('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const parsed = UpdateSubscriptionSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid update payload', parsed.error.flatten())
    }

    const payload = parsed.data

    try {
      const reminderFields = await resolveSubscriptionReminderFields(payload)
      const normalizedLogo =
        payload.logoUrl !== undefined || payload.logoSource !== undefined
          ? await normalizeLogoForStorage({
              logoUrl: payload.logoUrl ?? null,
              logoSource: payload.logoSource ?? null
            })
          : null

      const tagIds = payload.tagIds !== undefined ? normalizeTagIds(payload.tagIds) : null
      const timezone = await getAppTimezone()

      const subscription = await prisma.subscription.update({
        where: { id: params.data.id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
          ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
          ...(payload.billingIntervalCount !== undefined ? { billingIntervalCount: payload.billingIntervalCount } : {}),
          ...(payload.billingIntervalUnit !== undefined ? { billingIntervalUnit: payload.billingIntervalUnit } : {}),
          ...(payload.autoRenew !== undefined ? { autoRenew: payload.autoRenew } : {}),
          ...(payload.startDate !== undefined ? { startDate: parseDateInTimezone(payload.startDate, timezone) } : {}),
          ...(payload.nextRenewalDate !== undefined
            ? { nextRenewalDate: parseDateInTimezone(payload.nextRenewalDate, timezone) }
            : {}),
          ...(reminderFields.notifyDaysBefore !== undefined ? { notifyDaysBefore: reminderFields.notifyDaysBefore } : {}),
          ...(reminderFields.advanceReminderRules !== undefined
            ? { advanceReminderRules: reminderFields.advanceReminderRules }
            : {}),
          ...(reminderFields.overdueReminderRules !== undefined
            ? { overdueReminderRules: reminderFields.overdueReminderRules }
            : {}),
          ...(payload.webhookEnabled !== undefined ? { webhookEnabled: payload.webhookEnabled } : {}),
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
          ...(payload.websiteUrl !== undefined ? { websiteUrl: payload.websiteUrl } : {}),
          ...(normalizedLogo
            ? {
                logoUrl: normalizedLogo.logoUrl,
                logoSource: normalizedLogo.logoSource,
                logoFetchedAt: normalizedLogo.logoFetchedAt
              }
            : {})
        }
      })

      if (tagIds) {
        await replaceSubscriptionTags(prisma, subscription.id, tagIds)
      }

      const updated = await fetchSubscriptionWithTags(subscription.id)

      await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])
      return sendOk(reply, flattenSubscriptionTags(updated))
    } catch (error) {
      if (error instanceof Error && error.message.includes('Logo')) {
        return sendError(reply, 400, 'logo_import_failed', error.message)
      }
      return sendError(reply, 404, 'not_found', 'Subscription not found')
    }
  })

  app.post('/subscriptions/:id/renew', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const parsed = RenewSubscriptionSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid renew payload', parsed.error.flatten())
    }

    try {
      const timezone = await getAppTimezone()
      const result = await renewSubscription(
        params.data.id,
        parsed.data.paidAt ? parseDateInTimezone(parsed.data.paidAt, timezone) : undefined,
        parsed.data.amount,
        parsed.data.currency
      )

      await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar', 'exchange-rates'])
      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 404, 'not_found', error instanceof Error ? error.message : 'Renew failed')
    }
  })

  app.post('/subscriptions/:id/pause', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const updated = await prisma.subscription.update({
      where: { id: params.data.id },
      data: { status: 'paused' }
    })

    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])
    return sendOk(reply, updated)
  })

  app.post('/subscriptions/:id/cancel', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const updated = await prisma.subscription.update({
      where: { id: params.data.id },
      data: { status: 'cancelled' }
    })

    await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])
    return sendOk(reply, updated)
  })

  app.delete('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    try {
      await prisma.subscription.delete({
        where: { id: params.data.id }
      })

      await removeSubscriptionOrder(params.data.id)
      await invalidateWorkerLiteCache(['subscriptions', 'statistics', 'calendar'])
      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch {
      return sendError(reply, 404, 'not_found', 'Subscription not found')
    }
  })
}
