export function shouldRecommendDbImport(fileName?: string | null, previewFileType?: 'json' | 'db' | 'zip') {
  if (previewFileType === 'json') return true
  if (!fileName) return false
  return fileName.toLowerCase().endsWith('.json')
}

export const JSON_IMPORT_WARNING_MESSAGE =
  '检测到 Wallos JSON 导入。推荐优先使用 Wallos DB 导入：DB 包含 start_date、完整币种代码等更完整信息；JSON 虽可导入，但可能出现开始日期代填、币种推断等字段降级。'
