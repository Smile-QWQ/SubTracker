import { z } from 'zod'

export const PaymentSourceSchema = z.enum(['manual', 'automatic', 'legacy'])
export const PaymentRateSourceSchema = z.enum(['manual', 'current', 'legacy'])
export type PaymentSource = z.infer<typeof PaymentSourceSchema>
export type PaymentRateSource = z.infer<typeof PaymentRateSourceSchema>
const currency = z.string().regex(/^[A-Za-z]{3}$/).transform(value => value.toUpperCase())
const amount = z.number().finite().nonnegative().max(1e12)
const id = z.string().min(1).max(200)

export const PaymentConversionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preserve') }),
  z.object({ mode: z.literal('current'), baseCurrency: currency }),
  z.object({ mode: z.literal('manual'), baseCurrency: currency, exchangeRate: z.number().finite().positive().max(1e12) })
])

export const PaymentInputSchema = z.object({
  amount,
  currency,
  paidAt: z.string().date(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  note: z.string().max(1000).default(''),
  conversion: PaymentConversionSchema,
  confirmManual: z.boolean().default(false)
}).refine(value => value.periodEnd >= value.periodStart, { path: ['periodEnd'], message: 'paymentHistory.errors.period' })
export const CreatePaymentSchema = z.object({ subscriptionId: id }).and(PaymentInputSchema)
export const UpdatePaymentSchema = z.object({ revision: z.number().int().nonnegative() }).and(PaymentInputSchema)
export type PaymentInput = z.infer<typeof PaymentInputSchema>
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>

export const PaymentQuerySchema = z.object({
  subscriptionId: id.optional(),
  tagId: id.optional(),
  source: PaymentSourceSchema.optional(),
  baseCurrency: currency.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
}).refine(value => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'paymentHistory.errors.period' })
export type PaymentQuery = z.infer<typeof PaymentQuerySchema>

// Optional metadata is added to schema 2 backups. Older backups keep their original amounts and dates.
export const PaymentMetadataSchema = z.object({
  source: PaymentSourceSchema.default('legacy'),
  rateSource: PaymentRateSourceSchema.default('legacy'),
  note: z.string().max(1000).default(''),
  revision: z.number().int().nonnegative().default(0)
})

export interface PaymentHistoryRecord {
  id: string
  subscriptionId: string
  subscription: { id: string; name: string }
  amount: number
  currency: string
  baseCurrency: string
  convertedAmount: number
  exchangeRate: number
  paidAt: string
  periodStart: string
  periodEnd: string
  createdAt: string
  source: PaymentSource
  rateSource: PaymentRateSource
  note: string
  revision: number
}

export interface PaymentCurrencyTotal {
  currency: string
  amount: number
  count: number
  manual: number
  automatic: number
  legacy: number
}
export interface PaymentHistorySummary {
  totals: PaymentCurrencyTotal[]
  thisYear: PaymentCurrencyTotal[]
  count: number
  // Each point remains in its original bookkeeping currency; no current FX is applied.
  monthly: Array<{ month: string; currency: string; amount: number; count: number }>
  subscriptions: Array<{ id: string; name: string; currency: string; amount: number; count: number }>
}
export interface PaymentHistoryPage {
  items: PaymentHistoryRecord[]
  total: number
  page: number
  pageSize: number
}
