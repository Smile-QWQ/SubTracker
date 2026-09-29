import dayjs from 'dayjs'
import { getMessage, type BillingIntervalUnit } from '@subtracker/shared'
import type { SelectOption } from 'naive-ui/es/select/src/interface'
import { getAppLocale } from '@/locales'
import { normalizeWebsiteUrlInput } from './website-url'
import type { Subscription } from '@/types/api'

export type SubscriptionFormInitialValues = Pick<Subscription,
  | 'name' | 'tags' | 'description' | 'amount' | 'currency' | 'billingType'
  | 'billingIntervalCount' | 'billingIntervalUnit' | 'autoRenew'
  | 'startDate' | 'nextRenewalDate' | 'advanceReminderRules' | 'overdueReminderRules'
  | 'webhookEnabled' | 'notes' | 'websiteUrl' | 'logoUrl' | 'logoSource'
>

// Only editable fields are copied; identity, status and payment history belong to the original.
export function buildSubscriptionCopyDraft(source: Subscription): SubscriptionFormInitialValues {
  return {
    name: source.name,
    tags: source.tags?.map((tag) => ({ ...tag })),
    description: source.description,
    amount: source.amount,
    currency: source.currency,
    billingType: source.billingType ?? 'recurring',
    billingIntervalCount: source.billingIntervalCount,
    billingIntervalUnit: source.billingIntervalUnit,
    autoRenew: source.autoRenew,
    startDate: source.startDate,
    nextRenewalDate: source.nextRenewalDate,
    advanceReminderRules: source.advanceReminderRules,
    overdueReminderRules: source.overdueReminderRules,
    webhookEnabled: source.webhookEnabled,
    notes: source.notes,
    websiteUrl: source.websiteUrl,
    logoUrl: source.logoUrl,
    logoSource: source.logoSource
  }
}

export interface SubscriptionFormValidationInput {
  billingType?: 'recurring' | 'lifetime'
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

export type FrequencyOption = SelectOption

const DEFAULT_FREQUENCY_PRESET_MAX = 12

export function buildFrequencyOptions(
  selectedValue?: number | null,
  presetMax = DEFAULT_FREQUENCY_PRESET_MAX
): FrequencyOption[] {
  const options = Array.from({ length: presetMax }, (_, index) => ({
    label: `${index + 1}`,
    value: index + 1
  }))

  const normalizedSelected = normalizeFrequencyCount(selectedValue)
  if (normalizedSelected !== null && normalizedSelected > presetMax) {
    options.push({
      label: `${normalizedSelected}`,
      value: normalizedSelected
    })
  }

  return options
}

export function parseFrequencyOptionCreateInput(input: string): FrequencyOption | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null
  }

  return {
    label: `${value}`,
    value
  }
}

export function calculateNextRenewalDateTs(startDateTs: number, intervalCount: number, unit: BillingIntervalUnit): number {
  const start = dayjs(startDateTs)
  const count = Math.max(Number(intervalCount) || 1, 1)

  switch (unit) {
    case 'day':
      return start.add(count, 'day').valueOf()
    case 'week':
      return start.add(count, 'week').valueOf()
    case 'month':
      return start.add(count, 'month').valueOf()
    case 'quarter':
      return start.add(count * 3, 'month').valueOf()
    case 'year':
      return start.add(count, 'year').valueOf()
    default:
      return start.valueOf()
  }
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
  const locale = getAppLocale()
  const errors: SubscriptionFormErrors = {}

  if (!input.name.trim()) {
    errors.name = getMessage(locale, 'validation.subscriptionForm.nameRequired')
  } else if (input.name.trim().length > 150) {
    errors.name = getMessage(locale, 'validation.subscriptionForm.nameTooLong')
  }

  if (input.description.length > 500) {
    errors.description = getMessage(locale, 'validation.subscriptionForm.descriptionTooLong')
  }

  if (input.amount === null || input.amount === undefined || Number.isNaN(Number(input.amount)) || Number(input.amount) < 0) {
    errors.amount = getMessage(locale, 'validation.subscriptionForm.amountInvalid')
  }

  if (!/^[A-Z]{3}$/.test(String(input.currency || '').trim().toUpperCase())) {
    errors.currency = getMessage(locale, 'validation.subscriptionForm.currencyInvalid')
  }

  const isLifetime = input.billingType === 'lifetime'

  if (!isLifetime && (!Number.isInteger(Number(input.billingIntervalCount)) || Number(input.billingIntervalCount) <= 0)) {
    errors.billingIntervalCount = getMessage(locale, 'validation.subscriptionForm.billingIntervalCountInvalid')
  }

  if (!isLifetime && !input.billingIntervalUnit) {
    errors.billingIntervalUnit = getMessage(locale, 'validation.subscriptionForm.billingIntervalUnitRequired')
  }

  if (input.startDateTs === null || !Number.isFinite(input.startDateTs)) {
    errors.startDateTs = getMessage(locale, 'validation.subscriptionForm.startDateRequired')
  }

  if (!isLifetime && (input.nextRenewalDateTs === null || !Number.isFinite(input.nextRenewalDateTs))) {
    errors.nextRenewalDateTs = getMessage(locale, 'validation.subscriptionForm.nextRenewalDateRequired')
  }

  if (
    !isLifetime &&
    input.startDateTs !== null &&
    Number.isFinite(input.startDateTs) &&
    input.nextRenewalDateTs !== null &&
    Number.isFinite(input.nextRenewalDateTs) &&
    dayjs(input.nextRenewalDateTs).isBefore(dayjs(input.startDateTs), 'day')
  ) {
    errors.nextRenewalDateTs = getMessage(locale, 'validation.subscriptionForm.nextRenewalDateEarlierThanStartDate')
  }

  const normalizedWebsite = normalizeWebsiteUrlInput(input.websiteUrl)
  if (normalizedWebsite.error) {
    errors.websiteUrl = normalizedWebsite.error
  }

  if (input.notes.length > 1000) {
    errors.notes = getMessage(locale, 'validation.subscriptionForm.notesTooLong')
  }

  return {
    errors,
    normalizedWebsiteUrl: normalizedWebsite.value
  }
}

function normalizeFrequencyCount(value?: number | null): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    return null
  }

  return normalized
}
