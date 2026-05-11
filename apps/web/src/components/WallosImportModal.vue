<template>
  <n-modal :show="show" preset="card" :title="t('imports.wallos.title')" style="width: min(1080px, calc(100vw - 24px))" @update:show="handleShowUpdate">
    <n-space vertical :size="16" style="width: 100%">
      <n-alert type="info" :show-icon="false">
        {{ t('imports.wallos.description') }}
      </n-alert>

      <n-space align="center" wrap>
        <input ref="fileInputRef" type="file" accept=".json,.db,.sqlite,.sqlite3,.zip,application/octet-stream,application/json,application/zip" class="hidden-input" @change="handleFileChange" />
        <n-button @click="pickFile">{{ t('imports.wallos.pickFile') }}</n-button>
        <span class="file-name">{{ selectedFileName || t('common.placeholders.noFileSelected') }}</span>
        <n-button type="primary" :disabled="!selectedFile" :loading="inspecting" @click="inspectFile">{{ t('imports.wallos.preview') }}</n-button>
      </n-space>

      <n-alert v-if="showJsonImportWarning" type="warning" :show-icon="false">
        {{ jsonImportWarningMessage }}
      </n-alert>

      <n-space vertical :size="8" style="width: 100%">
        <span class="advanced-label">{{ t('imports.wallos.sourceTimezoneLabel') }}</span>
        <n-select
          v-model:value="wallosSourceTimezone"
          :options="timeZoneOptions"
          filterable
          style="max-width: 360px"
          :placeholder="t('imports.wallos.sourceTimezonePlaceholder')"
        />
        <span class="advanced-hint">{{ t('imports.wallos.sourceTimezoneHint') }}</span>
      </n-space>

      <template v-if="preview">
        <n-grid :cols="summaryCols" :x-gap="12" :y-gap="12">
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('imports.wallos.importTypeLabel') }}</div>
              <div class="summary-value">{{ fileTypeText(preview.summary.fileType) }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('imports.wallos.importableSubscriptionsLabel') }}</div>
              <div class="summary-value">{{ preview.summary.supportedSubscriptions }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('imports.wallos.importedTagsLabel') }}</div>
              <div class="summary-value">{{ preview.summary.usedTagsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">{{ t('imports.wallos.zipLogoLabel') }}</div>
              <div class="summary-value">{{ preview.summary.zipLogoMatched }}/{{ preview.summary.zipLogoMatched + preview.summary.zipLogoMissing }}</div>
            </n-card>
          </n-grid-item>
        </n-grid>

        <n-card :title="t('imports.wallos.tagPreviewTitle')" size="small">
          <n-empty v-if="preview.usedTags.length === 0" :description="t('imports.wallos.noImportableTags')" />
          <n-data-table v-else :columns="tagColumns" :data="preview.usedTags" :pagination="{ pageSize: 6 }" />
        </n-card>

        <n-card :title="t('imports.wallos.subscriptionPreviewTitle')" size="small">
          <n-data-table :columns="subscriptionColumns" :data="preview.subscriptionsPreview" :pagination="{ pageSize: 8 }" />
        </n-card>

        <n-card :title="t('imports.wallos.warningTitle')" size="small">
          <n-empty v-if="previewWarnings.length === 0" :description="t('imports.wallos.noWarnings')" />
          <template v-else>
            <div class="warning-header">
              <span>{{ t('imports.wallos.warningCount', { count: previewWarnings.length }) }}</span>
              <n-button text type="primary" @click="warningsExpanded = !warningsExpanded">
                {{ warningsExpanded ? t('common.actions.collapse') : t('common.actions.expand') }}
              </n-button>
            </div>
            <ul v-if="warningsExpanded" class="warning-list">
              <li v-for="item in previewWarnings" :key="item">{{ item }}</li>
            </ul>
          </template>
        </n-card>
      </template>

      <n-space justify="end">
        <n-button @click="close">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" :disabled="!preview" :loading="committing" @click="commitImport">
          {{ t('imports.wallos.confirmImport') }}
        </n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NAlert, NButton, NCard, NDataTable, NEmpty, NGrid, NGridItem, NModal, NSelect, NSpace, NTag } from 'naive-ui'
import { t } from '@/locales'
import { api } from '@/composables/api'
import type { WallosImportInspectResult, WallosImportSubscriptionPreview } from '@/types/api'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'
import { getJsonImportWarningMessage, shouldRecommendDbImport } from '@/utils/wallos-import'
import { buildTimeZoneOptions, formatDateInTimezone, normalizeAppTimezone } from '@/utils/timezone'
import { useLocalizedMessage } from '@/utils/localized-message'

const props = defineProps<{
  show: boolean
  defaultNotifyDays?: number
  baseCurrency?: string
  appTimezone?: string
}>()

const emit = defineEmits<{
  close: []
  imported: []
}>()

const { width } = useWindowSize()
const message = useLocalizedMessage()
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const preview = ref<WallosImportInspectResult | null>(null)
const inspecting = ref(false)
const committing = ref(false)
const warningsExpanded = ref(false)
const wallosSourceTimezone = ref(normalizeAppTimezone(props.appTimezone))
const jsonImportWarningMessage = computed(() => getJsonImportWarningMessage())

const summaryCols = computed(() => (width.value < 700 ? 2 : 4))
const timeZoneOptions = computed(() => buildTimeZoneOptions())
const showJsonImportWarning = computed(() =>
  shouldRecommendDbImport(selectedFileName.value, preview.value?.summary.fileType)
)
const previewWarnings = computed(() => {
  if (!preview.value) return []
  return Array.from(new Set([...preview.value.warnings, ...preview.value.subscriptionsPreview.flatMap((item) => item.warnings)]))
})

const tagColumns = computed(() => [
  { title: t('imports.wallos.sourceId'), key: 'sourceId' },
  { title: t('imports.wallos.tagName'), key: 'name' },
  { title: t('imports.wallos.order'), key: 'sortOrder' }
])

const subscriptionColumns = computed(() => [
  { title: t('imports.wallos.name'), key: 'name' },
  {
    title: t('imports.wallos.amount'),
    key: 'amount',
    render: (row: WallosImportSubscriptionPreview) => `${row.currency} ${row.amount.toFixed(2)}`
  },
  {
    title: t('imports.wallos.frequency'),
    key: 'billingInterval',
    render: (row: WallosImportSubscriptionPreview) =>
      t('subscriptions.values.interval', {
        count: row.billingIntervalCount,
        unit: unitText(row.billingIntervalUnit)
      })
  },
  {
    title: t('imports.wallos.nextRenewal'),
    key: 'nextRenewalDate',
    render: (row: WallosImportSubscriptionPreview) => formatDateInTimezone(row.nextRenewalDate, props.appTimezone)
  },
  {
    title: t('imports.wallos.tags'),
    key: 'tagNames',
    render: (row: WallosImportSubscriptionPreview) => row.tagNames.join(' / ') || t('imports.wallos.noTags')
  },
  {
    title: t('imports.wallos.autoRenew'),
    key: 'autoRenew',
    render: (row: WallosImportSubscriptionPreview) => (row.autoRenew ? t('imports.wallos.yes') : t('imports.wallos.no'))
  },
  {
    title: t('imports.wallos.status'),
    key: 'status',
    render: (row: WallosImportSubscriptionPreview) =>
      h(NTag, { type: getSubscriptionStatusTagType(row.status) }, { default: () => getSubscriptionStatusText(row.status) })
  },
  {
    title: t('imports.wallos.logo'),
    key: 'logoImportStatus',
    render: (row: WallosImportSubscriptionPreview) =>
      ({
        none: t('imports.wallos.logoNone'),
        'pending-file-match': t('imports.wallos.logoPending'),
        'ready-from-zip': t('imports.wallos.logoReady')
      })[row.logoImportStatus]
  }
])

function pickFile() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  selectedFile.value = file ?? null
  selectedFileName.value = file?.name ?? ''
  preview.value = null
  warningsExpanded.value = false
}

async function inspectFile() {
  if (!selectedFile.value) return

  inspecting.value = true
  try {
    const base64 = await readFileAsBase64(selectedFile.value)
    preview.value = await api.inspectWallosImport({
      filename: selectedFile.value.name,
      contentType: selectedFile.value.type || 'application/octet-stream',
      base64,
      sourceTimezone: wallosSourceTimezone.value
    })
    warningsExpanded.value = false
    message.success(t('imports.wallos.previewGenerated'))
  } catch (error) {
    preview.value = null
    message.error(error instanceof Error ? error.message : t('imports.wallos.previewFailed'))
  } finally {
    inspecting.value = false
  }
}

async function commitImport() {
  if (!preview.value) return

  committing.value = true
  try {
    const result = await api.commitWallosImport(preview.value.importToken)
    message.success(
      t('imports.wallos.importCompleted', {
        subscriptions: result.importedSubscriptions,
        tags: result.importedTags,
        logos: result.importedLogos
      })
    )
    emit('imported')
    close()
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('imports.wallos.importFailed'))
  } finally {
    committing.value = false
  }
}

function close() {
  emit('close')
}

function handleShowUpdate(value: boolean) {
  if (!value) {
    emit('close')
    return
  }

  wallosSourceTimezone.value = normalizeAppTimezone(props.appTimezone)
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      resolve(raw.includes(',') ? raw.split(',')[1] : raw)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function unitText(unit: WallosImportSubscriptionPreview['billingIntervalUnit']) {
  return {
    day: t('common.units.day'),
    week: t('common.units.week'),
    month: t('common.units.month'),
    quarter: t('common.units.quarter'),
    year: t('common.units.year')
  }[unit]
}

function fileTypeText(type: WallosImportInspectResult['summary']['fileType']) {
  return {
    json: t('imports.wallos.fileTypes.json'),
    db: t('imports.wallos.fileTypes.db'),
    zip: t('imports.wallos.fileTypes.zip')
  }[type]
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

.advanced-label {
  color: var(--app-text-strong);
  font-size: 13px;
  font-weight: 600;
}

.advanced-hint {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.summary-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.warning-list {
  margin-top: 12px;
  margin-bottom: 0;
  padding-left: 18px;
  color: var(--app-text-secondary);
  display: grid;
  gap: 8px;
}

.warning-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

</style>
