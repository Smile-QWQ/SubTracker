import { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../db'
import { sendCreated, sendError, sendOk } from '../http'
import type { AppLocale } from '@subtracker/shared'
import {
  CreateSubscriptionSchema,
  LogoSearchSchema,
  LogoUploadSchema,
  RenewSubscriptionSchema,
  UpdateSubscriptionSchema,
  getMessage
} from '@subtracker/shared'
import {
  appendSubscriptionOrder,
  removeSubscriptionOrder,
  setSubscriptionOrder,
  sortSubscriptionsByOrder
} from '../services/subscription-order.service'
import { renewSubscription } from '../services/subscription.service'
import { calculateSubscriptionRemainingValue } from '../services/subscription-value.service'
import { flattenSubscriptionTags, normalizeTagIds, replaceSubscriptionTags } from '../services/tag.service'
import {
  deleteLocalLogoFromLibrary,
  getLocalLogoLibrary,
  importRemoteLogo,
  normalizeLogoForStorage,
  saveUploadedLogo,
  searchSubscriptionLogos
} from '../services/logo.service'
import {
  buildAdvanceReminderRulesFromLegacyWithDefault,
  deriveNotifyDaysBeforeFromAdvanceRules,
  normalizeOptionalReminderRules
} from '../services/reminder-rules.service'
import { ensureExchangeRates } from '../services/exchange-rate.service'
import { getAppTimezone, getDefaultAdvanceReminderRulesSetting } from '../services/settings.service'
import { parseDateInTimezone, startOfDayDateInTimezone } from '../utils/timezone'
import { normalizeWebsiteUrlInput } from '../utils/website-url'

const subscriptionInclude = {
  tags: { include: { tag: true } }
} as const

type SubscriptionDetailPayload = Prisma.SubscriptionGetPayload<{ include: typeof subscriptionInclude }>

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

function parseBatchStatus(input: unknown) {
  return z
    .object({
      ids: z.array(z.string()).min(1),
      status: z.enum(['active', 'paused', 'cancelled'])
    })
    .safeParse(input)
}

function getSubscriptionValidationMessageKey(error: string) {
  switch (error) {
    case 'Only active subscriptions can be paused in batch mode':
      return 'api.errors.subscriptions.batchPauseOnlyActive'
    case 'Only active subscriptions can be cancelled in batch mode':
      return 'api.errors.subscriptions.batchCancelOnlyActive'
    default:
      return error
  }
}

function normalizeSubscriptionPayloadWebsiteUrl<T extends Record<string, unknown>>(
  payload: T,
  locale: AppLocale = 'zh-CN'
): { payload: T; websiteUrlError: string | null } {
  if (!Object.prototype.hasOwnProperty.call(payload, 'websiteUrl')) {
    return { payload, websiteUrlError: null }
  }

  const normalizedWebsite = normalizeWebsiteUrlInput(payload.websiteUrl as string | null | undefined, locale)
  if (normalizedWebsite.error) {
    return { payload, websiteUrlError: normalizedWebsite.error }
  }

  return {
    payload: {
      ...payload,
      websiteUrl: normalizedWebsite.value
    },
    websiteUrlError: null
  }
}

async function runBatchAction(
  ids: string[],
  action: (id: string) => Promise<void>,
  options?: {
    locale?: AppLocale
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
    const existing = new Set(rows.map((item: { id: string }) => item.id))
    const missingId = ids.find((id) => !existing.has(id))
    return {
      successCount: 0,
      failureCount: 1,
      failures: [
        {
          id: missingId ?? 'unknown',
          message: 'api.errors.subscriptions.notFound'
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
        message: getSubscriptionValidationMessageKey(validationError)
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
        message: error instanceof Error ? error.message : getMessage(options?.locale ?? 'zh-CN', 'common.errors.requestFailed')
      })
    }
  }

  return {
    successCount,
    failureCount: failures.length,
    failures
  }
}

async function buildSubscriptionDetailResponse(
  row: SubscriptionDetailPayload | null,
  timezone: string
) {
  if (!row) return null

  const flatRow = flattenSubscriptionTags(row)
  const paymentRecords = await prisma.paymentRecord.findMany({
    where: { subscriptionId: flatRow.id },
    orderBy: [{ periodEnd: 'desc' }, { paidAt: 'desc' }]
  })
  const exchangeRates = await ensureExchangeRates()

  return {
    ...flatRow,
    ...calculateSubscriptionRemainingValue(flatRow, paymentRecords, new Date(), timezone, {
      baseCurrency: exchangeRates.baseCurrency,
      exchangeRatesBaseCurrency: exchangeRates.baseCurrency,
      exchangeRates: exchangeRates.rates
    })
  }
}

export async function subscriptionRoutes(app: FastifyInstance) {
  app.post('/subscriptions/logo/search', async (request, reply) => {
    const parsed = LogoSearchSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidLogoSearchPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    return sendOk(reply, await searchSubscriptionLogos(parsed.data, request.locale))
  })

  app.get('/subscriptions/logo/library', async (_request, reply) => {
    return sendOk(reply, await getLocalLogoLibrary())
  })

  app.delete('/subscriptions/logo/library/:filename', async (request, reply) => {
    const parsed = z.object({ filename: z.string().min(1).max(255) }).safeParse(request.params)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidLogoFilename', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await deleteLocalLogoFromLibrary(parsed.data.filename, request.locale))
    } catch (error) {
      return sendError(reply, 400, 'logo_delete_failed', error instanceof Error ? error.message : 'api.errors.subscriptions.logoDeleteFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/subscriptions/logo/upload', async (request, reply) => {
    const parsed = LogoUploadSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidLogoUploadPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await saveUploadedLogo(parsed.data, request.locale))
    } catch (error) {
      return sendError(reply, 400, 'logo_upload_failed', error instanceof Error ? error.message : 'api.errors.subscriptions.logoUploadFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/subscriptions/logo/import', async (request, reply) => {
    const parsed = z.object({
      logoUrl: z.string().url(),
      source: z.string().max(100).optional()
    }).safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidLogoImportPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      return sendOk(reply, await importRemoteLogo(parsed.data, request.locale))
    } catch (error) {
      return sendError(reply, 400, 'logo_import_failed', error instanceof Error ? error.message : 'api.errors.subscriptions.logoImportFailed', undefined, {
        locale: request.locale
      })
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
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidQuery', parsed.error.flatten(), {
        locale: request.locale
      })
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
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          ...tagIds.map((tagId) => ({
            tags: {
              some: {
                tagId
              }
            }
          }))
        ]
      }
    }

    const rows = await prisma.subscription.findMany({
      where,
      include: subscriptionInclude,
      orderBy: [{ createdAt: 'asc' }]
    })

    return sendOk(reply, await sortSubscriptionsByOrder(rows.map(flattenSubscriptionTags)))
  })

  app.post('/subscriptions/reorder', async (request, reply) => {
    const parsed = z.object({
      ids: z.array(z.string()).min(1)
    }).safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidReorderPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    await setSubscriptionOrder(parsed.data.ids)
    return sendOk(reply, { success: true })
  })

  app.post('/subscriptions/batch/renew', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidBatchRenewPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    const result = await runBatchAction(parsed.data.ids, async (id) => {
      await renewSubscription(id)
    })

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/status', async (request, reply) => {
    const parsed = parseBatchStatus(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidBatchStatusPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    const result = await runBatchAction(parsed.data.ids, async (id) => {
      await prisma.subscription.update({
        where: { id },
        data: { status: parsed.data.status }
      })
    })

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/pause', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidBatchPausePayload', parsed.error.flatten(), {
        locale: request.locale
      })
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
        locale: request.locale,
        validate: (rows) =>
          rows.some((row) => row.status !== 'active') ? 'api.errors.subscriptions.batchPauseOnlyActive' : null
      }
    )

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/cancel', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidBatchCancelPayload', parsed.error.flatten(), {
        locale: request.locale
      })
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
        locale: request.locale,
        validate: (rows) =>
          rows.some((row) => row.status !== 'active') ? 'api.errors.subscriptions.batchCancelOnlyActive' : null
      }
    )

    return sendOk(reply, result)
  })

  app.post('/subscriptions/batch/delete', async (request, reply) => {
    const parsed = parseBatchIds(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidBatchDeletePayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    const rows = await prisma.subscription.findMany({
      where: {
        id: { in: parsed.data.ids }
      },
      select: {
        id: true,
        status: true
      }
    })

    if (rows.length !== parsed.data.ids.length) {
      const existing = new Set(rows.map((item: { id: string }) => item.id))
      const missingId = parsed.data.ids.find((id) => !existing.has(id))
      return sendError(reply, 404, 'not_found', 'api.errors.subscriptions.notFound', {
        successCount: 0,
        failureCount: 1,
        failures: [{ id: missingId ?? 'unknown', message: 'api.errors.subscriptions.notFound' }]
      }, {
        locale: request.locale
      })
    }

    const failures: Array<{ id: string; message: string }> = []
    let successCount = 0

    for (const row of rows) {
      if (row.status === 'active') {
        failures.push({
          id: row.id,
          message: 'api.errors.subscriptions.activeDeleteBlocked'
        })
        continue
      }

      try {
        await prisma.subscription.delete({
          where: { id: row.id }
        })
        await removeSubscriptionOrder(row.id)
        successCount += 1
      } catch (error) {
        failures.push({
          id: row.id,
          message: error instanceof Error ? error.message : getMessage(request.locale ?? 'zh-CN', 'common.errors.requestFailed')
        })
      }
    }

    return sendOk(reply, {
      successCount,
      failureCount: failures.length,
      failures
    })
  })

  app.get('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    const row = await prisma.subscription.findUnique({
      where: { id: params.data.id },
      include: subscriptionInclude
    })

    if (!row) {
      return sendError(reply, 404, 'not_found', 'api.errors.subscriptions.notFound', undefined, {
        locale: request.locale
      })
    }

    const timezone = await getAppTimezone()
    const detail = await buildSubscriptionDetailResponse(row, timezone)
    return sendOk(reply, detail)
  })

  app.get('/subscriptions/:id/payment-records', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    const records = await prisma.paymentRecord.findMany({
      where: { subscriptionId: params.data.id },
      orderBy: { paidAt: 'desc' }
    })

    return sendOk(reply, records)
  })

  app.post('/subscriptions', async (request, reply) => {
    const normalizedPayload = normalizeSubscriptionPayloadWebsiteUrl((request.body ?? {}) as Record<string, unknown>, request.locale)
    if (normalizedPayload.websiteUrlError) {
      return sendError(reply, 422, 'validation_error', 'api.errors.subscriptions.websiteUrlInvalid', {
        fieldErrors: {
          websiteUrl: [normalizedPayload.websiteUrlError]
        }
      }, {
        locale: request.locale
      })
    }

    const parsed = CreateSubscriptionSchema.safeParse(normalizedPayload.payload)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    let normalizedLogo
    try {
      normalizedLogo = await normalizeLogoForStorage({
        logoUrl: parsed.data.logoUrl ?? null,
        logoSource: parsed.data.logoSource ?? null
      }, request.locale)
    } catch (error) {
      return sendError(reply, 400, 'logo_import_failed', error instanceof Error ? error.message : 'api.errors.subscriptions.logoImportFailed', undefined, {
        locale: request.locale
      })
    }

    const tagIds = normalizeTagIds(parsed.data.tagIds)
    let reminderFields: Awaited<ReturnType<typeof resolveSubscriptionReminderFields>>

    try {
      reminderFields = await resolveSubscriptionReminderFields(parsed.data)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'api.errors.validation.invalidReminderRules', undefined, {
        locale: request.locale
      })
    }

    const timezone = await getAppTimezone()

    const created = await prisma.$transaction(async (tx: any) => {
      const subscription = await tx.subscription.create({
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

      await replaceSubscriptionTags(tx, subscription.id, tagIds)
      return tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: subscriptionInclude
      })
    })

    await appendSubscriptionOrder(created.id)
    return sendCreated(reply, flattenSubscriptionTags(created))
  })

  app.patch('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    const normalizedPayload = normalizeSubscriptionPayloadWebsiteUrl((request.body ?? {}) as Record<string, unknown>, request.locale)
    if (normalizedPayload.websiteUrlError) {
      return sendError(reply, 422, 'validation_error', 'api.errors.subscriptions.websiteUrlInvalid', {
        fieldErrors: {
          websiteUrl: [normalizedPayload.websiteUrlError]
        }
      }, {
        locale: request.locale
      })
    }

    const parsed = UpdateSubscriptionSchema.safeParse(normalizedPayload.payload)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidUpdatePayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    const payload = parsed.data

    try {
      const reminderFields = await resolveSubscriptionReminderFields(payload)
      const normalizedLogo =
        payload.logoUrl !== undefined || payload.logoSource !== undefined
          ? await normalizeLogoForStorage({
              logoUrl: payload.logoUrl ?? null,
              logoSource: payload.logoSource ?? null
            }, request.locale)
          : null

      const timezone = await getAppTimezone()
      const updated = await prisma.$transaction(async (tx: any) => {
        const tagIds = payload.tagIds !== undefined ? normalizeTagIds(payload.tagIds) : null
        const existing = await tx.subscription.findUnique({
          where: { id: params.data.id }
        })

        if (!existing) {
          throw new Error('api.errors.subscriptions.notFound')
        }

        const normalizedNextRenewalDate =
          payload.nextRenewalDate !== undefined ? parseDateInTimezone(payload.nextRenewalDate, timezone) : undefined
        const shouldRestoreActive =
          payload.status === undefined &&
          existing.status === 'expired' &&
          normalizedNextRenewalDate !== undefined &&
          normalizedNextRenewalDate.getTime() >= startOfDayDateInTimezone(new Date(), timezone).getTime()

        const subscription = await tx.subscription.update({
          where: { id: params.data.id },
          data: {
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.description !== undefined ? { description: payload.description } : {}),
            ...(payload.status !== undefined ? { status: payload.status } : shouldRestoreActive ? { status: 'active' } : {}),
            ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
            ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
            ...(payload.billingIntervalCount !== undefined ? { billingIntervalCount: payload.billingIntervalCount } : {}),
            ...(payload.billingIntervalUnit !== undefined ? { billingIntervalUnit: payload.billingIntervalUnit } : {}),
            ...(payload.autoRenew !== undefined ? { autoRenew: payload.autoRenew } : {}),
            ...(payload.startDate !== undefined ? { startDate: parseDateInTimezone(payload.startDate, timezone) } : {}),
            ...(normalizedNextRenewalDate !== undefined ? { nextRenewalDate: normalizedNextRenewalDate } : {}),
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
          await replaceSubscriptionTags(tx, subscription.id, tagIds)
        }

        return tx.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
          include: subscriptionInclude
        })
      })

      return sendOk(reply, flattenSubscriptionTags(updated))
    } catch (error) {
      if (error instanceof Error && error.message.includes('Logo')) {
        return sendError(reply, 400, 'logo_import_failed', error.message, undefined, {
          locale: request.locale
        })
      }
      return sendError(reply, 404, 'not_found', 'api.errors.subscriptions.notFound', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/subscriptions/:id/renew', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    const parsed = RenewSubscriptionSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidRenewPayload', parsed.error.flatten(), {
        locale: request.locale
      })
    }

    try {
      const timezone = await getAppTimezone()
      const result = await renewSubscription(
        params.data.id,
        parsed.data.paidAt ? parseDateInTimezone(parsed.data.paidAt, timezone) : undefined,
        parsed.data.amount,
        parsed.data.currency
      )

      return sendOk(reply, result)
    } catch (error) {
      return sendError(reply, 404, 'not_found', error instanceof Error ? error.message : 'api.errors.subscriptions.renewFailed', undefined, {
        locale: request.locale
      })
    }
  })

  app.post('/subscriptions/:id/pause', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    const updated = await prisma.subscription.update({
      where: { id: params.data.id },
      data: { status: 'paused' }
    })

    return sendOk(reply, updated)
  })

  app.post('/subscriptions/:id/cancel', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    const updated = await prisma.subscription.update({
      where: { id: params.data.id },
      data: { status: 'cancelled' }
    })

    return sendOk(reply, updated)
  })

  app.delete('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'api.errors.validation.invalidSubscriptionId', undefined, {
        locale: request.locale
      })
    }

    try {
      const existing = await prisma.subscription.findUnique({
        where: { id: params.data.id },
        select: { id: true, status: true }
      })

      if (!existing) {
        return sendError(reply, 404, 'not_found', 'api.errors.subscriptions.notFound', undefined, {
          locale: request.locale
        })
      }

      if (existing.status === 'active') {
        return sendError(reply, 422, 'subscription_delete_not_allowed', 'api.errors.subscriptions.activeDeleteNotAllowed', undefined, {
          locale: request.locale
        })
      }

      await prisma.subscription.delete({
        where: { id: params.data.id }
      })

      await removeSubscriptionOrder(params.data.id)
      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch {
      return sendError(reply, 404, 'not_found', 'api.errors.subscriptions.notFound', undefined, {
        locale: request.locale
      })
    }
  })
}
