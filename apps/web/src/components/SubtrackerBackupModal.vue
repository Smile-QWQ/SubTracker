<template>
  <n-modal :show="show" preset="card" :title="t('subscriptions.backupModal.title')" style="width: min(960px, calc(100vw - 24px))" :mask-closable="!committing" :close-on-esc="!committing" :closable="!committing" @update:show="handleShowUpdate">
    <n-space vertical :size="16" style="width: 100%">
      <n-alert type="info" :show-icon="false">
        {{ t('subscriptions.backupModal.description') }}
      </n-alert>

      <n-space align="center" wrap>
        <input
          ref="fileInputRef"
          type="file"
          accept=".zip,application/zip"
          class="hidden-input"
          @change="handleFileChange"
        />
        <n-button :disabled="committing" @click="pickFile">{{ t('subscriptions.backupModal.pickZip') }}</n-button>
        <span class="file-name">{{ selectedFileName || t('subscriptions.backupModal.noFileSelected') }}</span>
        <n-button type="primary" :disabled="!selectedFile || committing" :loading="inspecting" @click="inspectFile">
          {{ t('subscriptions.backupModal.previewBackup') }}
        </n-button>
      </n-space>

      <div v-if="limits" class="file-name">{{ t('subscriptions.backupModal.sizeLimits', { archive: formatBytes(limits.maxArchiveBytes), expanded: formatBytes(limits.maxExpandedBytes) }) }}</div>
      <n-alert v-if="inspecting" type="info" :show-icon="false">
        {{ uploadPercent < 100 ? t('subscriptions.backupModal.uploadProgress', { percent: uploadPercent }) : t('subscriptions.backupModal.validating') }}
      </n-alert>
      <n-alert v-if="committing" type="info" :show-icon="false">{{ t('subscriptions.backupModal.restoring') }}</n-alert>

      <template v-if="preview">
        <n-alert v-if="preview.summary.includesSubscriptionImages === false" type="warning" :show-icon="false">{{ t('subscriptions.backupModal.withoutImages') }}</n-alert>
        <n-grid :cols="summaryCols" :x-gap="12" :y-gap="12">
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('subscriptions.backupModal.subscriptions') }}</div>
              <div class="summary-value">{{ preview.summary.subscriptionsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('subscriptions.backupModal.tags') }}</div>
              <div class="summary-value">{{ preview.summary.tagsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('subscriptions.backupModal.paymentRecords') }}</div>
              <div class="summary-value">{{ preview.summary.paymentRecordsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('subscriptions.backupModal.localLogos') }}</div>
              <div class="summary-value">{{ preview.summary.logosTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('subscriptions.backupModal.subscriptionImages') }}</div>
              <div class="summary-value">{{ preview.summary.subscriptionImagesTotal ?? 0 }}</div>
            </n-card>
          </n-grid-item>
        </n-grid>

        <n-card :title="t('subscriptions.backupModal.restoreMode')" size="small">
          <n-space vertical>
            <n-radio-group v-model:value="restoreMode" :disabled="committing">
              <n-space vertical>
                <n-radio value="replace">{{ t('subscriptions.backupModal.replaceMode') }}</n-radio>
                <n-radio value="append">{{ t('subscriptions.backupModal.appendMode') }}</n-radio>
              </n-space>
            </n-radio-group>

            <n-alert v-if="restoreMode === 'replace'" type="warning" :show-icon="false">
              {{ t('subscriptions.backupModal.replaceWarning') }}
            </n-alert>

            <template v-else>
              <n-alert type="info" :show-icon="false">
                {{ t('subscriptions.backupModal.appendHelp') }}
              </n-alert>
              <div class="switch-row">
                <n-switch v-model:value="restoreSettings" :disabled="committing" />
                <span class="switch-inline-label">{{ t('subscriptions.backupModal.restoreSettingsLabel') }}</span>
              </div>
            </template>
          </n-space>
        </n-card>

        <n-card :title="t('subscriptions.backupModal.restorePreview')" size="small">
          <n-space vertical :size="8">
            <div class="conflict-row">
              <span>{{ t('subscriptions.backupModal.existingSameNameTags') }}</span>
              <strong>{{ preview.conflicts.existingTagNameCount }}</strong>
            </div>
            <div class="conflict-row">
              <span>{{ t('subscriptions.backupModal.existingSubscriptions') }}</span>
              <strong>{{ preview.conflicts.existingSubscriptionIdCount }}</strong>
            </div>
            <div class="conflict-row">
              <span>{{ t('subscriptions.backupModal.existingPaymentRecords') }}</span>
              <strong>{{ preview.conflicts.existingPaymentRecordIdCount }}</strong>
            </div>
          </n-space>
        </n-card>

        <n-card :title="t('subscriptions.backupModal.warnings')" size="small">
          <ul class="warning-list">
            <li v-for="item in preview.warnings" :key="item">{{ item }}</li>
          </ul>
        </n-card>
      </template>

      <n-space justify="end">
        <n-button :disabled="committing" @click="close">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" :disabled="!preview || inspecting" :loading="committing" @click="commitImport">
          {{ t('subscriptions.backupModal.confirmRestore') }}
        </n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { SubtrackerBackupLimitsDto } from '@subtracker/shared'
import { useWindowSize } from '@vueuse/core'
import { NAlert, NButton, NCard, NGrid, NGridItem, NModal, NRadio, NRadioGroup, NSpace, NSwitch } from 'naive-ui'
import { t } from '@/locales'
import { api } from '@/composables/api'
import type { SubtrackerBackupInspectResult } from '@/types/api'
import { useLocalizedMessage } from '@/utils/localized-message'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  imported: [result: { mode: 'replace' | 'append'; restoredSettings: boolean }]
}>()

const { width } = useWindowSize()
const message = useLocalizedMessage()
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const preview = ref<SubtrackerBackupInspectResult | null>(null)
const inspecting = ref(false)
const committing = ref(false)
const restoreMode = ref<'replace' | 'append'>('replace')
const restoreSettings = ref(false)
const limits = ref<SubtrackerBackupLimitsDto | null>(null)
const uploadPercent = ref(0)
let generation = 0
let uploadController: AbortController | undefined

function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? `${Number((bytes / 1024 ** 3).toFixed(2))} GiB` : `${Number((bytes / 1024 ** 2).toFixed(2))} MiB`
}

function discardPreview() {
  const token = preview.value?.importToken
  preview.value = null
  if (token) void api.discardSubtrackerBackup(token).catch(() => undefined)
}

function reset() {
  generation += 1
  uploadController?.abort()
  uploadController = undefined
  inspecting.value = false
  uploadPercent.value = 0
  discardPreview()
  selectedFile.value = null
  selectedFileName.value = ''
  if (fileInputRef.value) fileInputRef.value.value = ''
}

watch(() => props.show, show => {
  reset()
  if (show) {
    const current = generation
    void api.getSubtrackerBackupLimits().then(value => { if (current === generation) limits.value = value }).catch(() => undefined)
  }
}, { immediate: true })
onBeforeUnmount(reset)

const summaryCols = computed(() => (width.value < 700 ? 2 : 5))

function normalizePreviewErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/invalid zip data/i.test(error.message)) {
      return t('subscriptions.backupModal.invalidZip')
    }
    return error.message
  }
  return t('subscriptions.backupModal.previewFailed')
}

function buildRestoreSuccessMessage(result: {
  importedSubscriptions: number
  importedTags: number
  importedPaymentRecords: number
  importedLogos: number
  importedSubscriptionImages?: number
  mode: 'replace' | 'append'
}) {
  const images = result.importedSubscriptionImages ?? 0
  const importedTotal =
    result.importedSubscriptions + result.importedTags + result.importedPaymentRecords + result.importedLogos + images

  if (result.mode === 'append' && importedTotal === 0) {
    return t('subscriptions.backupModal.nothingImported')
  }

  return t('subscriptions.backupModal.restoreCompleted', {
    subscriptions: result.importedSubscriptions,
    tags: result.importedTags,
    payments: result.importedPaymentRecords,
    logos: result.importedLogos,
    images
  })
}

function pickFile() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (committing.value) return
  reset()
  selectedFile.value = file ?? null
  selectedFileName.value = file?.name ?? ''
  restoreMode.value = 'replace'
  restoreSettings.value = false
}

async function inspectFile() {
  const file = selectedFile.value
  if (!file || inspecting.value || committing.value) return
  const current = ++generation
  const previous = preview.value?.importToken
  preview.value = null
  inspecting.value = true
  uploadPercent.value = 0
  uploadController = new AbortController()
  const signal = uploadController.signal
  try {
    if (previous) await api.discardSubtrackerBackup(previous)
    limits.value = await api.getSubtrackerBackupLimits()
    if (current !== generation) return
    if (file.size > limits.value.maxArchiveBytes) throw new Error(t('subscriptions.backupModal.backupTooLarge', { limit: formatBytes(limits.value.maxArchiveBytes) }))
    const result = await api.inspectSubtrackerBackup(file, { signal, onProgress: percent => { if (current === generation) uploadPercent.value = percent } })
    if (current !== generation || !props.show) {
      void api.discardSubtrackerBackup(result.importToken).catch(() => undefined)
      return
    }
    preview.value = result
    message.success(t('subscriptions.backupModal.previewGenerated'))
  } catch (error) {
    if (current === generation && !signal.aborted) message.error(normalizePreviewErrorMessage(error))
  } finally {
    if (current === generation) inspecting.value = false
  }
}

async function commitImport() {
  if (!preview.value || committing.value || inspecting.value) return

  committing.value = true
  try {
    const result = await api.commitSubtrackerBackup({
      importToken: preview.value.importToken,
      mode: restoreMode.value,
      restoreSettings: restoreMode.value === 'replace' ? true : restoreSettings.value
    })
    preview.value = null
    message.success(buildRestoreSuccessMessage(result))
    emit('imported', {
      mode: result.mode,
      restoredSettings: result.restoredSettings
    })
    reset()
    emit('close')
  } catch (error) {
    discardPreview()
    message.error(error instanceof Error ? error.message : t('subscriptions.backupModal.restoreFailed'))
  } finally {
    committing.value = false
  }
}

function close() {
  if (committing.value) return
  reset()
  emit('close')
}

function handleShowUpdate(value: boolean) {
  if (!value) close()
}
</script>

<style scoped>
.hidden-input {
  display: none;
}

.file-name {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.summary-label {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.summary-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.warning-list {
  margin: 0;
  padding-left: 18px;
  color: var(--app-text-secondary);
  display: grid;
  gap: 8px;
}

.conflict-row,
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-inline-label {
  color: var(--app-text-secondary);
}
</style>
