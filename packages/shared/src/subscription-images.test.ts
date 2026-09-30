import { describe, expect, it } from 'vitest'
import { CreateSubscriptionSchema, UpdateSubscriptionSchema } from './index'

const valid = { name: 'With notes', amount: 12, currency: 'USD', billingIntervalUnit: 'month', startDate: '2026-01-01', nextRenewalDate: '2026-02-01', notes: 'keep text' }
const ids = Array.from({ length: 21 }, (_, i) => `c${String(i).padStart(24, '0')}`)

describe('subscription image selections', () => {
  it('leaves omitted imageIds undefined for legacy create/update', () => {
    expect(CreateSubscriptionSchema.parse(valid)).toMatchObject({ notes: 'keep text' })
    expect(CreateSubscriptionSchema.parse(valid).imageIds).toBeUndefined()
    expect(UpdateSubscriptionSchema.parse({ notes: 'keep text' })).toEqual({ notes: 'keep text' })
  })

  it.each([[], ids.slice(0, 1), ids.slice(0, 20)].map((imageIds) => ({ imageIds })))('allows an explicit unique selection (%#)', ({ imageIds }) => {
    expect(CreateSubscriptionSchema.parse({ ...valid, imageIds }).imageIds).toEqual(imageIds)
    expect(UpdateSubscriptionSchema.parse({ imageIds }).imageIds).toEqual(imageIds)
  })

  it.each([ids, [ids[0], ids[0]], ['bad-id'], null].map((imageIds) => ({ imageIds })))('rejects oversized, duplicate and invalid selections (%#)', ({ imageIds }) => {
    expect(CreateSubscriptionSchema.safeParse({ ...valid, imageIds }).success).toBe(false)
    expect(UpdateSubscriptionSchema.safeParse({ imageIds }).success).toBe(false)
  })
})
