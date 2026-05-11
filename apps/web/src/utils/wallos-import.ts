import { t } from '@/locales'

export function shouldRecommendDbImport(fileName?: string | null, previewFileType?: 'json' | 'db' | 'zip') {
  if (previewFileType === 'json') return true
  if (!fileName) return false
  return fileName.toLowerCase().endsWith('.json')
}

export function getJsonImportWarningMessage() {
  return t('imports.wallos.jsonWarning')
}
