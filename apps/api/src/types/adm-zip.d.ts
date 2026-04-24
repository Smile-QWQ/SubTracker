declare module 'adm-zip' {
  export interface IZipEntry {
    entryName: string
    isDirectory: boolean
    getData(): Buffer
  }

  export default class AdmZip {
    constructor(input?: Buffer | Uint8Array | ArrayBuffer | string)
    addFile(entryName: string, content: Buffer | Uint8Array | ArrayBuffer): void
    getEntries(): IZipEntry[]
    toBuffer(): Buffer
  }
}
