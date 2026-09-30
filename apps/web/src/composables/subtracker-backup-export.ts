import { onBeforeUnmount, ref } from 'vue'
import type { SubtrackerBackupExportFormat } from '@subtracker/shared'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { useLocalizedMessage } from '@/utils/localized-message'

export function useSubtrackerBackupExport() {
  const message = useLocalizedMessage()
  const backupFormat = ref<SubtrackerBackupExportFormat>('standard')
  const includeBackupImages = ref(true)
  const exportingBackup = ref(false)
  const showLegacyBackupConfirmation = ref(false)
  let disposed = false

  onBeforeUnmount(() => {
    disposed = true
    showLegacyBackupConfirmation.value = false
  })

  async function download(format: SubtrackerBackupExportFormat, includeImages = format === 'standard' && includeBackupImages.value) {
    if (disposed || exportingBackup.value) return
    exportingBackup.value = true
    try {
      const result = await api.exportBackup(includeImages, format)
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

  function exportBackup() {
    if (disposed || exportingBackup.value || showLegacyBackupConfirmation.value) return
    if (backupFormat.value === 'legacy-v0.11') {
      showLegacyBackupConfirmation.value = true
      return
    }
    return download('standard')
  }

  function confirmLegacyBackupExport() {
    if (!showLegacyBackupConfirmation.value) return
    showLegacyBackupConfirmation.value = false
    return download('legacy-v0.11')
  }

  return {
    backupFormat, includeBackupImages, exportingBackup, showLegacyBackupConfirmation,
    exportBackup, confirmLegacyBackupExport
  }
}
