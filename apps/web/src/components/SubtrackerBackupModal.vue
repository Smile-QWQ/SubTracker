<template>
  <n-modal :show="show" preset="card" :title="t('subscriptions.backupModal.title')" style="width: min(960px, calc(100vw - 24px))" @update:show="handleShowUpdate">
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
        <n-button @click="pickFile">{{ t('subscriptions.backupModal.pickZip') }}</n-button>
        <span class="file-name">{{ selectedFileName || t('subscriptions.backupModal.noFileSelected') }}</span>
        <n-button type="primary" :disabled="!selectedFile" :loading="inspecting" @click="inspectFile">{{ t('subscriptions.backupModal.previewBackup') }}</n-button>
      </n-space>

      <template v-if="preview">
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
        </n-grid>

        <n-card :title="t('subscriptions.backupModal.restoreMode')" size="small">
          <n-space vertical>
            <n-radio-group v-model:value="restoreMode">
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
                <n-switch v-model:value="restoreSettings" />
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
        <n-button @click="close">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" :disabled="!preview" :loading="committing" @click="commitImport">{{ t('subscriptions.backupModal.confirmRestore') }}</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NAlert, NButton, NCard, NGrid, NGridItem, NModal, NRadio, NRadioGroup, NSpace, NSwitch, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { api } from '@/composables/api'
import type { SubtrackerBackupInspectResult, SubtrackerBackupPreparedPayload } from '@/types/api'
import { buildPreparedSubtrackerBackupPayload } from '@/utils/subtracker-backup-client'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  imported: [result: { mode: 'replace' | 'append'; restoredSettings: boolean }]
}>()

const { width } = useWindowSize()
const message = useMessage()
const { t } = useI18n()
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const preview = ref<SubtrackerBackupInspectResult | null>(null)
const preparedPayload = ref<SubtrackerBackupPreparedPayload | null>(null)
const inspecting = ref(false)
const committing = ref(false)
const restoreMode = ref<'replace' | 'append'>('replace')
const restoreSettings = ref(false)

const summaryCols = computed(() => (width.value < 700 ? 2 : 4))

function pickFile() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  selectedFile.value = file ?? null
  selectedFileName.value = file?.name ?? ''
  preview.value = null
  preparedPayload.value = null
  restoreMode.value = 'replace'
  restoreSettings.value = false
}

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
  mode: 'replace' | 'append'
}) {
  const importedTotal =
    result.importedSubscriptions + result.importedTags + result.importedPaymentRecords + result.importedLogos

  if (result.mode === 'append' && importedTotal === 0) {
    return t('subscriptions.backupModal.nothingImported')
  }

  return t('subscriptions.backupModal.restoreCompleted', {
    subscriptions: result.importedSubscriptions,
    tags: result.importedTags,
    payments: result.importedPaymentRecords,
    logos: result.importedLogos
  })
}

async function inspectFile() {
  if (!selectedFile.value) return

  inspecting.value = true
  try {
    const prepared = await buildPreparedSubtrackerBackupPayload(selectedFile.value)
    preparedPayload.value = prepared
    preview.value = await api.inspectSubtrackerBackup({
      filename: selectedFile.value.name,
      manifest: prepared.manifest,
      logoAssets: prepared.logoAssets
    })
    message.success(t('subscriptions.backupModal.previewGenerated'))
  } catch (error) {
    preview.value = null
    preparedPayload.value = null
    message.error(normalizePreviewErrorMessage(error))
  } finally {
    inspecting.value = false
  }
}

async function commitImport() {
  if (!preview.value || !preparedPayload.value) return

  committing.value = true
  try {
    const result = await api.commitSubtrackerBackup({
      manifest: preparedPayload.value.manifest,
      logoAssets: preparedPayload.value.logoAssets,
      mode: restoreMode.value,
      restoreSettings: restoreMode.value === 'replace' ? true : restoreSettings.value
    })
    message.success(buildRestoreSuccessMessage(result))
    emit('imported', {
      mode: result.mode,
      restoredSettings: result.restoredSettings
    })
    close()
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('subscriptions.backupModal.restoreFailed'))
  } finally {
    committing.value = false
  }
}

function close() {
  preparedPayload.value = null
  emit('close')
}

function handleShowUpdate(value: boolean) {
  if (!value) {
    emit('close')
  }
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
