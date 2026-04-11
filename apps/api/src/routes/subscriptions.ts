import dayjs from 'dayjs'
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
import { renewSubscription } from '../services/subscription.service'
import { dispatchNotificationEvent } from '../services/channel-notification.service'
import {
  deleteLocalLogoFromLibrary,
  getLocalLogoLibrary,
  importRemoteLogo,
  normalizeLogoForStorage,
  saveUploadedLogo,
  searchSubscriptionLogos
} from '../services/logo.service'

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
    const parsed = z
      .object({
        filename: z.string().min(1).max(255)
      })
      .safeParse(request.params)

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
    const parsed = z
      .object({
        logoUrl: z.string().url(),
        source: z.string().max(100).optional()
      })
      .safeParse(request.body)

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
      categoryId: z.string().optional()
    })

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid query', parsed.error.flatten())
    }

    const where: Record<string, unknown> = {}
    if (parsed.data.q) {
      where.OR = [{ name: { contains: parsed.data.q } }, { description: { contains: parsed.data.q } }]
    }
    if (parsed.data.status) where.status = parsed.data.status
    if (parsed.data.categoryId) where.categoryId = parsed.data.categoryId

    const rows = await prisma.subscription.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'asc' }]
    })

    return sendOk(reply, await sortSubscriptionsByOrder(rows))
  })

  app.post('/subscriptions/reorder', async (request, reply) => {
    const parsed = z
      .object({
        ids: z.array(z.string()).min(1)
      })
      .safeParse(request.body)

    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid reorder payload', parsed.error.flatten())
    }

    await setSubscriptionOrder(parsed.data.ids)
    return sendOk(reply, { success: true })
  })

  app.get('/subscriptions/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid subscription id')
    }

    const row = await prisma.subscription.findUnique({
      where: { id: params.data.id },
      include: {
        category: true
      }
    })

    if (!row) {
      return sendError(reply, 404, 'not_found', 'Subscription not found')
    }

    return sendOk(reply, row)
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

    const created = await prisma.subscription.create({
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        description: parsed.data.description,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billingIntervalCount: parsed.data.billingIntervalCount,
        billingIntervalUnit: parsed.data.billingIntervalUnit,
        startDate: dayjs(parsed.data.startDate).toDate(),
        nextRenewalDate: dayjs(parsed.data.nextRenewalDate).toDate(),
        notifyDaysBefore: parsed.data.notifyDaysBefore,
        webhookEnabled: parsed.data.webhookEnabled,
        notes: parsed.data.notes,
        websiteUrl: parsed.data.websiteUrl ?? null,
        logoUrl: normalizedLogo.logoUrl,
        logoSource: normalizedLogo.logoSource,
        logoFetchedAt: normalizedLogo.logoFetchedAt
      },
      include: { category: true }
    })

    await appendSubscriptionOrder(created.id)
    return sendCreated(reply, created)
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
      const normalizedLogo =
        payload.logoUrl !== undefined || payload.logoSource !== undefined
          ? await normalizeLogoForStorage({
              logoUrl: payload.logoUrl ?? null,
              logoSource: payload.logoSource ?? null
            })
          : null

      const updated = await prisma.subscription.update({
        where: { id: params.data.id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
          ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
          ...(payload.billingIntervalCount !== undefined ? { billingIntervalCount: payload.billingIntervalCount } : {}),
          ...(payload.billingIntervalUnit !== undefined ? { billingIntervalUnit: payload.billingIntervalUnit } : {}),
          ...(payload.startDate !== undefined ? { startDate: dayjs(payload.startDate).toDate() } : {}),
          ...(payload.nextRenewalDate !== undefined ? { nextRenewalDate: dayjs(payload.nextRenewalDate).toDate() } : {}),
          ...(payload.notifyDaysBefore !== undefined ? { notifyDaysBefore: payload.notifyDaysBefore } : {}),
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
        },
        include: { category: true }
      })

      return sendOk(reply, updated)
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
      const result = await renewSubscription(
        params.data.id,
        parsed.data.paidAt ? dayjs(parsed.data.paidAt).toDate() : undefined,
        parsed.data.amount,
        parsed.data.currency
      )

      await dispatchNotificationEvent({
        eventType: 'subscription.renewed',
        resourceKey: `subscription:${params.data.id}`,
        periodKey: dayjs(result.payment.paidAt).format('YYYY-MM-DD'),
        subscriptionId: params.data.id,
        payload: {
          subscriptionId: params.data.id,
          paymentId: result.payment.id,
          amount: result.payment.amount,
          currency: result.payment.currency,
          convertedAmount: result.payment.convertedAmount,
          baseCurrency: result.payment.baseCurrency,
          paidAt: result.payment.paidAt.toISOString(),
          nextRenewalDate: result.subscription.nextRenewalDate.toISOString()
        }
      })

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
      return sendOk(reply, { id: params.data.id, deleted: true })
    } catch {
      return sendError(reply, 404, 'not_found', 'Subscription not found')
    }
  })
}
