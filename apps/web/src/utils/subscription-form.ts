import type { BillingIntervalUnit } from '@subtracker/shared'
import dayjs from 'dayjs'
import { addIntervalToPickerTs } from './timezone'
import { normalizeWebsiteUrlInput } from './website-url'

export interface SubscriptionFormValidationInput {
  name: string
  description: string
  amount: number | null
  currency: string
  billingIntervalCount: number
  billingIntervalUnit: BillingIntervalUnit | ''
  startDateTs: number | null
  nextRenewalDateTs: number | null
  websiteUrl: string
  notes: string
}

export type SubscriptionFormErrors = Partial<Record<keyof SubscriptionFormValidationInput, string>>

export function calculateNextRenewalDateTs(startDateTs: number, intervalCount: number, unit: BillingIntervalUnit): number {
  const count = Math.max(Number(intervalCount) || 1, 1)
  return addIntervalToPickerTs(startDateTs, count, unit)
}

export function canRecalculateNextRenewal(input: {
  startDateTs: number | null
  billingIntervalCount: number
  billingIntervalUnit: BillingIntervalUnit | ''
}): boolean {
  return (
    input.startDateTs !== null &&
    Number.isFinite(input.startDateTs) &&
    Number(input.billingIntervalCount) > 0 &&
    !!input.billingIntervalUnit
  )
}

export function validateSubscriptionForm(input: SubscriptionFormValidationInput): {
  errors: SubscriptionFormErrors
  normalizedWebsiteUrl: string | null
} {
  const errors: SubscriptionFormErrors = {}

  if (!input.name.trim()) {
    errors.name = '请填写名称'
  } else if (input.name.trim().length > 150) {
    errors.name = '名称不能超过 150 个字符'
  }

  if (input.description.length > 500) {
    errors.description = '描述不能超过 500 个字符'
  }

  if (input.amount === null || input.amount === undefined || Number.isNaN(Number(input.amount)) || Number(input.amount) < 0) {
    errors.amount = '请填写有效金额'
  }

  if (!/^[A-Z]{3}$/.test(String(input.currency || '').trim().toUpperCase())) {
    errors.currency = '请选择合法货币'
  }

  if (!Number.isInteger(Number(input.billingIntervalCount)) || Number(input.billingIntervalCount) <= 0) {
    errors.billingIntervalCount = '频率必须为正整数'
  }

  if (!input.billingIntervalUnit) {
    errors.billingIntervalUnit = '请选择频率单位'
  }

  if (input.startDateTs === null || !Number.isFinite(input.startDateTs)) {
    errors.startDateTs = '请选择开始日期'
  }

  if (input.nextRenewalDateTs === null || !Number.isFinite(input.nextRenewalDateTs)) {
    errors.nextRenewalDateTs = '请选择下次续订日期'
  }

  if (
    input.startDateTs !== null &&
    Number.isFinite(input.startDateTs) &&
    input.nextRenewalDateTs !== null &&
    Number.isFinite(input.nextRenewalDateTs) &&
    dayjs(input.nextRenewalDateTs).isBefore(dayjs(input.startDateTs), 'day')
  ) {
    errors.nextRenewalDateTs = '下次续订日期不能早于开始日期'
  }

  const normalizedWebsite = normalizeWebsiteUrlInput(input.websiteUrl)
  if (normalizedWebsite.error) {
    errors.websiteUrl = normalizedWebsite.error
  }

  if (input.notes.length > 1000) {
    errors.notes = '备注不能超过 1000 个字符'
  }

  return {
    errors,
    normalizedWebsiteUrl: normalizedWebsite.value
  }
}
