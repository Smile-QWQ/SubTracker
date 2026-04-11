export type ApiSuccess<T> = {
  data: T
  meta?: Record<string, unknown>
}

export type ApiError = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
