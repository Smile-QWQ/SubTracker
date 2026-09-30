import { onBeforeUnmount, ref } from 'vue'
import type { SubtrackerBackupExportFormat, SubtrackerBackupMissingAssetDto } from '@subtracker/shared'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { useLocalizedMessage } from '@/utils/localized-message'

export function useSubtrackerBackupExport() {
  const message = useLocalizedMessage()
  const backupFormat = ref<SubtrackerBackupExportFormat>('standard')
  const includeBackupImages = ref(true)
  const exportingBackup = ref(false)
  const showLegacyBackupConfirmation = ref(false)
  const showMissingBackupConfirmation = ref(false)
  const missingBackupAssets = ref<SubtrackerBackupMissingAssetDto[]>([])
  let pendingExport: { format: SubtrackerBackupExportFormat; includeImages: boolean } | null = null
  let disposed = false

  function cancelMissingBackupExport() {
    showMissingBackupConfirmation.value = false
    missingBackupAssets.value = []
    pendingExport = null
  }

  onBeforeUnmount(() => {
    disposed = true
    showLegacyBackupConfirmation.value = false
    cancelMissingBackupExport()
  })

  async function download(format: SubtrackerBackupExportFormat, includeImages = format === 'standard' && includeBackupImages.value, confirmedMissingAssets: string[] = []) {
    if (disposed || exportingBackup.value) return
    exportingBackup.value = true
    try {
      const result = await api.exportBackup(includeImages, format, confirmedMissingAssets)
      if (disposed) return
      if ('missingAssets' in result) {
        missingBackupAssets.value = result.missingAssets
        pendingExport = { format, includeImages }
        showMissingBackupConfirmation.value = true
        return
      }
      cancelMissingBackupExport()
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
    if (disposed || exportingBackup.value || showLegacyBackupConfirmation.value || showMissingBackupConfirmation.value) return
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

  async function confirmMissingBackupExport() {
    if (!showMissingBackupConfirmation.value || !pendingExport || exportingBackup.value) return false
    const { format, includeImages } = pendingExport
    const paths = missingBackupAssets.value.map(asset => asset.path)
    cancelMissingBackupExport()
    await download(format, includeImages, paths)
    // Control visibility ourselves: a newly missing file may require another confirmation.
    return false
  }

  return {
    backupFormat, includeBackupImages, exportingBackup, showLegacyBackupConfirmation,
    showMissingBackupConfirmation, missingBackupAssets, cancelMissingBackupExport, confirmMissingBackupExport,
    exportBackup, confirmLegacyBackupExport
  }
}
