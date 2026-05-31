import { getMessage } from '@subtracker/shared'
import { getAppLocale } from '@/locales'

type ApiErrorLike = {
  message?: string
  response?: {
    status?: number
    data?: {
      error?: {
        message?: string
        details?: {
          fieldErrors?: Record<string, string[] | undefined>
        }
      }
    }
  }
}

export function normalizeApiErrorMessage(error: ApiErrorLike) {
  const locale = getAppLocale()
  const workerLimitHint = getMessage(locale, 'common.errors.workerLimitHint')
  const responseMessage = error.response?.data?.error?.message?.trim()
  const fieldErrors = error.response?.data?.error?.details?.fieldErrors
  const firstFieldError = fieldErrors
    ? Object.values(fieldErrors).flatMap((messages) => messages ?? []).find(Boolean)
    : null
  const fallbackMessage = error.message?.trim()
  const status = error.response?.status
  const rawMessage = firstFieldError || responseMessage || fallbackMessage || getMessage(locale, 'common.errors.requestFailed')

  if (/Worker exceeded CPU time limit/i.test(rawMessage)) {
    return getMessage(locale, 'common.errors.workerCpuLimitExceeded', {
      hint: workerLimitHint
    })
  }

  if (status === 503) {
    return getMessage(locale, 'common.errors.serviceUnavailableWithWorkerHint', {
      hint: workerLimitHint
    })
  }

  return rawMessage
}
