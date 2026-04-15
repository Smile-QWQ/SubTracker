declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }

  export interface Statement {
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export interface Database {
    prepare(sql: string): Statement
    run(sql: string): void
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}
