import { describe, expect, it } from 'vitest'
import { getDefaultAiSubscriptionPrompt } from '@subtracker/shared'
import { AI_RECOGNITION_JSON_SCHEMA, parseAiRecognition } from '../../src/utils/ai-output'

describe('AI recognition billing type', () => {
  it('retains lifetime purchase values and omits invented renewal fields', () => {
    const result = parseAiRecognition(JSON.stringify({name:'Lifetime license',billingType:'lifetime',amount:0,currency:'USD',startDate:'2026-03-10',billingIntervalCount:1,billingIntervalUnit:'year',nextRenewalDate:'2027-03-10',notifyDaysBefore:3,advanceReminderRules:'3&09:30;',overdueReminderRules:'1&09:30;'}))
    expect(result).toEqual({name:'Lifetime license',billingType:'lifetime',amount:0,currency:'USD',startDate:'2026-03-10'})
  })
  it('preserves recurring intervals and does not guess absent or null billing types', () => {
    expect(parseAiRecognition('{"billingType":"recurring","billingIntervalCount":3,"billingIntervalUnit":"month"}')).toEqual({billingType:'recurring',billingIntervalCount:3,billingIntervalUnit:'month'})
    expect(parseAiRecognition('{"name":"Unknown","billingType":null}')).toEqual({name:'Unknown'})
    expect(parseAiRecognition('{"name":"Legacy response"}')).toEqual({name:'Legacy response'})
    expect(() => parseAiRecognition('{"billingType":"annual"}')).toThrow()
  })
  it('exposes the nullable type in strict provider schemas and both default prompts', () => {
    expect(AI_RECOGNITION_JSON_SCHEMA.properties.billingType).toEqual({type:['string','null'],enum:['recurring','lifetime',null]})
    expect(AI_RECOGNITION_JSON_SCHEMA.required).toContain('billingType')
    for (const locale of ['zh-CN','en-US'] as const) expect(getDefaultAiSubscriptionPrompt(locale)).toContain('billingType(recurring|lifetime)')
  })
})
