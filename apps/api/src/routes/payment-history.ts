import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { CreatePaymentSchema, UpdatePaymentSchema, PaymentQuerySchema } from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { createPayment, updatePayment, deletePayment, listPayments, summarizePayments, PaymentHistoryError } from '../services/payment-history.service'

export async function paymentHistoryRoutes(app: FastifyInstance) {
  const idSchema = z.object({ id: z.string().min(1).max(200) })
  const invalid = (request: FastifyRequest, reply: FastifyReply) => sendError(reply, 422, 'validation_error', 'paymentHistory.errors.invalid', undefined, { locale: request.locale })
  const run = async (request: FastifyRequest, reply: FastifyReply, action: () => Promise<unknown>) => {
    try { return sendOk(reply, await action()) } catch (error) {
      if (error instanceof PaymentHistoryError) return sendError(reply, error.status, 'payment_error', error.key, undefined, { locale: request.locale })
      throw error
    }
  }
  app.get('/payment-records', async (request, reply) => {
    const parsed = PaymentQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalid(request, reply)
    return run(request, reply, () => listPayments(parsed.data))
  })
  app.get('/payment-records/summary', async (request, reply) => {
    const parsed = PaymentQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalid(request, reply)
    return run(request, reply, () => summarizePayments(parsed.data))
  })
  app.post('/payment-records', async (request, reply) => {
    const parsed = CreatePaymentSchema.safeParse(request.body)
    if (!parsed.success) return invalid(request, reply)
    return run(request, reply, () => createPayment(parsed.data.subscriptionId, parsed.data))
  })
  app.put('/payment-records/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params)
    const parsed = UpdatePaymentSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return invalid(request, reply)
    return run(request, reply, () => updatePayment(params.data.id, parsed.data))
  })
  app.delete('/payment-records/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params)
    const parsed = z.object({ revision: z.coerce.number().int().nonnegative() }).safeParse(request.query)
    if (!params.success || !parsed.success) return invalid(request, reply)
    return run(request, reply, () => deletePayment(params.data.id, parsed.data.revision))
  })
}
