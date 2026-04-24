declare module 'sql.js' {
  export interface Statement {
    step(): boolean
    getAsObject<T extends Record<string, unknown> = Record<string, unknown>>(): T
    free(): void
  }

  export interface Database {
    prepare(sql: string): Statement
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | ArrayLike<number>) => Database
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>
}
