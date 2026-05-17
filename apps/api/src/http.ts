import type { FastifyReply } from 'fastify'
import { resolveAppLocaleFromAcceptLanguage, type AppLocale } from '@subtracker/shared'
import { translateErrorDetails, translateErrorMessage } from './i18n'

export function sendOk<T>(reply: FastifyReply, data: T, meta?: Record<string, unknown>) {
  return reply.status(200).send({ data, meta })
}

export function sendCreated<T>(reply: FastifyReply, data: T) {
  return reply.status(201).send({ data })
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  messageKey: string,
  details?: unknown,
  options?: {
    locale?: AppLocale
    params?: Record<string, string | number | boolean | null | undefined>
  }
) {
  const request = (reply as FastifyReply & {
    request?: { locale?: AppLocale; headers?: Record<string, unknown> }
  }).request
  const requestLocale =
    request?.locale ??
    resolveAppLocaleFromAcceptLanguage(
      typeof request?.headers?.['x-subtracker-locale'] === 'string'
        ? request.headers['x-subtracker-locale']
        : request?.headers?.['accept-language'],
      'zh-CN'
    )
  const translateOptions = {
    locale: options?.locale ?? requestLocale,
    params: options?.params
  } as const
  return reply.status(status).send({
    error: {
      code,
      message: translateErrorMessage(messageKey, translateOptions),
      details: translateErrorDetails(details, translateOptions)
    }
  })
}
