import {
  DEFAULT_APP_LOCALE,
  getMessage,
  type AppLocale,
  type AppriseConfigInput
} from '@subtracker/shared'
import { validateNotificationTargetUrl } from './notification-url.service'
import {
  APPRISE_ENABLED_TARGET_TAG,
  buildAppriseConfigText,
  getAppriseTargetInternalTag,
  hasAppriseTargets
} from './apprise-config.service'
import type { DirectNotificationMessage } from './notification-presentation.service'

function resolveAppriseBaseUrl(apiBaseUrl: string, locale: AppLocale = DEFAULT_APP_LOCALE) {
  const target = validateNotificationTargetUrl(apiBaseUrl.trim(), {
    label: getMessage(locale, 'settings.labels.appriseApiBaseUrl'),
    locale
  })

  if (!target.pathname.endsWith('/')) {
    target.pathname = `${target.pathname}/`
  }

  target.search = ''
  target.hash = ''
  return target
}

function buildAppriseEndpoint(apiBaseUrl: string, relativePath: string, locale: AppLocale) {
  return new URL(relativePath.replace(/^\/+/, ''), resolveAppriseBaseUrl(apiBaseUrl, locale))
}

async function requestApprise(
  requestUrl: URL,
  options: {
    method: 'GET' | 'POST'
    locale: AppLocale
    body?: string
    contentType?: string
  }
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json'
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = options.contentType ?? 'application/json'
  }

  const response = await fetch(requestUrl, {
    method: options.method,
    headers,
    body: options.body
  })

  return {
    status: response.status,
    text: await response.text()
  }
}

function ensureAppriseConfigReady(config: AppriseConfigInput) {
  const apiBaseUrl = config.apiBaseUrl?.trim()
  const key = config.key?.trim()
  if (!apiBaseUrl || !key || !hasAppriseTargets(config)) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.appriseDisabledOrIncomplete'))
  }

  return {
    apiBaseUrl,
    key
  }
}

function resolveAppriseTag(config: AppriseConfigInput, targetId?: string) {
  if (!targetId) {
    return APPRISE_ENABLED_TARGET_TAG
  }

  const target = config.targets.find((item) => item.id === targetId)
  if (!target) {
    throw new Error(getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.appriseTargetNotFound'))
  }

  return getAppriseTargetInternalTag(targetId)
}

async function postAppriseJson(
  apiBaseUrl: string,
  routePath: string,
  payload: Record<string, unknown>,
  locale: AppLocale
) {
  const response = await requestApprise(buildAppriseEndpoint(apiBaseUrl, routePath, locale), {
    method: 'POST',
    locale,
    body: JSON.stringify(payload),
    contentType: 'application/json'
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.appriseRequestFailed')}: HTTP ${response.status}${response.text ? ` ${response.text}` : ''}`.trim()
    )
  }
}

export async function syncAppriseConfig(
  config: AppriseConfigInput,
  options: {
    locale?: AppLocale
    keyOverride?: string
  } = {}
) {
  const locale = options.locale ?? DEFAULT_APP_LOCALE
  const { apiBaseUrl, key } = ensureAppriseConfigReady(config)

  await postAppriseJson(
    apiBaseUrl,
    `add/${encodeURIComponent(options.keyOverride ?? key)}`,
    {
      config: buildAppriseConfigText(config),
      format: 'text'
    },
    locale
  )
}

export async function deleteAppriseConfig(
  config: Pick<AppriseConfigInput, 'apiBaseUrl'>,
  key: string,
  locale: AppLocale = DEFAULT_APP_LOCALE
) {
  const apiBaseUrl = String(config.apiBaseUrl ?? '').trim()
  if (!apiBaseUrl || !String(key ?? '').trim()) {
    return
  }

  try {
    await postAppriseJson(apiBaseUrl, `del/${encodeURIComponent(key)}`, {}, locale)
  } catch {
    // best effort
  }
}

async function notifyAppriseKey(
  message: DirectNotificationMessage,
  config: AppriseConfigInput,
  options: {
    locale: AppLocale
    keyOverride?: string
    targetId?: string
    allowResync?: boolean
  }
) {
  const { apiBaseUrl, key } = ensureAppriseConfigReady(config)
  const response = await requestApprise(buildAppriseEndpoint(apiBaseUrl, `notify/${encodeURIComponent(options.keyOverride ?? key)}`, options.locale), {
    method: 'POST',
    locale: options.locale,
    body: JSON.stringify({
      title: message.title,
      body: message.markdown || message.text,
      format: 'markdown',
      type: 'info',
      tag: resolveAppriseTag(config, options.targetId)
    }),
    contentType: 'application/json'
  })

  if (response.status === 204 && options.allowResync !== false && !options.keyOverride) {
    await syncAppriseConfig(config, { locale: options.locale })
    return notifyAppriseKey(message, config, {
      ...options,
      allowResync: false
    })
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `${getMessage(DEFAULT_APP_LOCALE, 'api.errors.notifications.appriseRequestFailed')}: HTTP ${response.status}${response.text ? ` ${response.text}` : ''}`.trim()
    )
  }
}

export async function sendAppriseWithConfig(
  message: DirectNotificationMessage,
  config: AppriseConfigInput,
  options: {
    locale?: AppLocale
    targetId?: string
    keyOverride?: string
    syncBeforeSend?: boolean
  } = {}
) {
  const locale = options.locale ?? DEFAULT_APP_LOCALE
  if (options.syncBeforeSend) {
    await syncAppriseConfig(config, {
      locale,
      keyOverride: options.keyOverride
    })
  }

  await notifyAppriseKey(message, config, {
    locale,
    targetId: options.targetId,
    keyOverride: options.keyOverride,
    allowResync: !options.keyOverride
  })
}
