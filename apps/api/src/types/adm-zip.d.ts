declare module 'adm-zip' {
  export interface IZipEntry {
    entryName: string
    isDirectory: boolean
    getData(): Buffer
  }

  export default class AdmZip {
    constructor(input?: Buffer | string)
    addFile(entryName: string, content: Buffer): void
    getEntries(): IZipEntry[]
    toBuffer(): Buffer
  }
}
