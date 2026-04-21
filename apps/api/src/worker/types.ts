export interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>
}

export interface KVNamespace {
  get(key: string, type?: 'text' | 'json'): Promise<any>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface R2ObjectBody {
  body: ReadableStream | null
  httpEtag: string
  uploaded?: Date
  writeHttpMetadata(headers: Headers): void
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: {
      httpMetadata?: {
        contentType?: string
      }
    }
  ): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<{
    objects: Array<{
      key: string
      uploaded?: Date
    }>
  }>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  all<T = unknown>(): Promise<{ results: T[] }>
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<unknown>
  batch?(statements: D1PreparedStatement[]): Promise<unknown>
  withSession?(constraint?: string): D1Database
  dump?(): Promise<ArrayBuffer>
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

export interface ScheduledController {
  cron: string
  scheduledTime: number
}
