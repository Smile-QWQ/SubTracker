import { z } from 'zod'
import type { AiRecognitionResultDto } from '@subtracker/shared'

const recognitionFields = {
  name: z.string(), description: z.string(), amount: z.number().finite().nonnegative(), currency: z.string(),
  billingType: z.enum(['recurring', 'lifetime']),
  billingIntervalCount: z.number().int().positive(), billingIntervalUnit: z.enum(['day', 'week', 'month', 'year']),
  startDate: z.string(), nextRenewalDate: z.string(), notifyDaysBefore: z.number().int().nonnegative(),
  advanceReminderRules: z.string(), overdueReminderRules: z.string(), websiteUrl: z.string(), notes: z.string(),
  confidence: z.number().min(0).max(1), rawText: z.string()
}
const recognitionSchema = z.object(Object.fromEntries(Object.entries(recognitionFields).map(([key, value]) => [key, value.nullish()])))

// Nullable required fields work with strict providers without inventing unknown billing values.
export const AI_RECOGNITION_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(Object.keys(recognitionFields).map(key => [key,
    key === 'billingType' ? { type: ['string', 'null'], enum: ['recurring', 'lifetime', null] }
      : key === 'billingIntervalUnit' ? { type: ['string', 'null'], enum: ['day', 'week', 'month', 'year', null] }
      : { type: [['amount', 'billingIntervalCount', 'notifyDaysBefore', 'confidence'].includes(key) ? 'number' : 'string', 'null'] }
  ])),
  required: Object.keys(recognitionFields)
}

export const AI_DIAGNOSTIC_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } }, required: ['ok']
}

export function parseAiJson(raw: string): unknown {
  return JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1'))
}

export function parseAiRecognition(raw: string): AiRecognitionResultDto {
  const parsed = recognitionSchema.parse(parseAiJson(raw))
  const result = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== null && value !== undefined)) as AiRecognitionResultDto
  // A one-time purchase has no renewal cycle or renewal reminders.
  if (result.billingType === 'lifetime') {
    delete result.billingIntervalCount
    delete result.billingIntervalUnit
    delete result.nextRenewalDate
    delete result.notifyDaysBefore
    delete result.advanceReminderRules
    delete result.overdueReminderRules
  }
  return result
}
