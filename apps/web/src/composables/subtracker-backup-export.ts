import { onBeforeUnmount, ref } from 'vue'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { useLocalizedMessage } from '@/utils/localized-message'

export function useSubtrackerBackupExport() {
  const message = useLocalizedMessage()
  const includeBackupImages = ref(true)
  const exportingBackup = ref(false)
  let disposed = false

  onBeforeUnmount(() => {
    disposed = true
  })

  async function download(includeImages = includeBackupImages.value) {
    if (disposed || exportingBackup.value) return
    exportingBackup.value = true
    try {
      const result = await api.exportBackup(includeImages)
      if (disposed) return
      const { downloadUrl } = result
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = ''
      link.referrerPolicy = 'no-referrer'
      document.body.append(link)
      try {
        link.click()
      } finally {
        link.remove()
      }
      message.success(t('settings.messages.zipExportStarted'))
    } catch (error) {
      if (!disposed) message.error(error instanceof Error ? error.message : t('settings.messages.zipExportFailed'))
    } finally {
      exportingBackup.value = false
    }
  }

  return { includeBackupImages, exportingBackup, exportBackup: () => download() }
}
