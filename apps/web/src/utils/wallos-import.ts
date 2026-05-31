import { getMessage } from '@subtracker/shared'
import { getAppLocale } from '@/locales'

export function shouldRecommendDbImport(fileName?: string | null, previewFileType?: 'json' | 'db' | 'zip') {
  if (previewFileType === 'json') return true
  if (!fileName) return false
  return fileName.toLowerCase().endsWith('.json')
}

export function getWallosJsonImportWarningMessage() {
  return getMessage(getAppLocale(), 'imports.wallos.jsonWarning')
}

export const JSON_IMPORT_WARNING_MESSAGE = getWallosJsonImportWarningMessage()
