type ApiErrorLike = {
  message?: string
  response?: {
    status?: number
    data?: {
      error?: {
        message?: string
      }
    }
  }
}

const WORKER_LIMIT_HINT = '当前请求可能触发了 Cloudflare Worker 免费版限制，请稍后重试，并避免连续重复点击。'

export function normalizeApiErrorMessage(error: ApiErrorLike) {
  const responseMessage = error.response?.data?.error?.message?.trim()
  const fallbackMessage = error.message?.trim()
  const status = error.response?.status
  const rawMessage = responseMessage || fallbackMessage || '请求失败'

  if (/Worker exceeded CPU time limit/i.test(rawMessage)) {
    return `请求失败：Worker 执行超出 CPU 限制。${WORKER_LIMIT_HINT}`
  }

  if (status === 503) {
    return `请求失败：服务暂时不可用。${WORKER_LIMIT_HINT}`
  }

  return rawMessage
}
