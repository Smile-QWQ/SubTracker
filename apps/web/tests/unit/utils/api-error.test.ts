import { getMessage } from '@subtracker/shared'
import { describe, expect, it } from 'vitest'
import { normalizeApiErrorMessage } from '@/utils/api-error'
import { getAppLocale } from '@/locales'

describe('normalizeApiErrorMessage', () => {
  it('converts worker cpu limit errors to a clearer Worker limit hint', () => {
    expect(
      normalizeApiErrorMessage({
        message: 'Worker exceeded CPU time limit.',
        response: {
          status: 503
        }
      })
    ).toContain(getMessage(getAppLocale(), 'common.errors.workerLimitHint'))
  })

  it('adds a Worker limit hint for generic 503 errors', () => {
    expect(
      normalizeApiErrorMessage({
        message: 'Request failed with status code 503',
        response: {
          status: 503
        }
      })
    ).toContain(getMessage(getAppLocale(), 'common.errors.serviceUnavailableWithWorkerHint', {
      hint: getMessage(getAppLocale(), 'common.errors.workerLimitHint')
    }).split('。')[0] ?? '')
  })

  it('keeps non-503 errors unchanged', () => {
    expect(
      normalizeApiErrorMessage({
        message: '字段校验失败',
        response: {
          status: 400
        }
      })
    ).toBe('字段校验失败')
  })

  it('prefers backend fieldErrors over generic validation messages', () => {
    expect(
      normalizeApiErrorMessage({
        message: 'Request failed with status code 422',
        response: {
          status: 422,
          data: {
            error: {
              message: 'Invalid subscription payload',
              details: {
                fieldErrors: {
                  websiteUrl: [getMessage(getAppLocale(), 'validation.websiteUrlInvalid')]
                }
              }
            }
          }
        }
      })
    ).toBe(getMessage(getAppLocale(), 'validation.websiteUrlInvalid'))
  })
})
