<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('subscriptions.aiModal.title')"
    style="width: min(720px, calc(100vw - 24px))"
    :mask-closable="!loading"
    :closable="!loading"
    @mask-click="handleMaskClick"
    @update:show="handleUpdateShow"
  >
    <n-space vertical>
      <n-alert type="info" :show-icon="false">
        {{ t('subscriptions.aiModal.description') }}
      </n-alert>

      <n-spin :show="loading" size="small">
        <template #description>
          <div class="ai-loading-copy">
            <div class="ai-loading-copy__primary">{{ loadingStatusText }}</div>
            <div class="ai-loading-copy__secondary">{{ t('subscriptions.aiModal.loadingHint') }}</div>
          </div>
        </template>

        <n-form label-placement="top">
          <n-form-item :label="t('subscriptions.aiModal.textLabel')">
            <n-input
              v-model:value="text"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :placeholder="t('subscriptions.aiModal.textPlaceholder')"
              :disabled="loading"
            />
          </n-form-item>

          <n-form-item :label="t('subscriptions.aiModal.imageLabel')">
            <div class="ai-upload-box" @paste="handlePaste">
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                class="hidden-input"
                :disabled="loading"
                @change="handleFileChange"
              />
              <n-space vertical>
                <n-space>
                  <n-button :disabled="loading" @click="pickFile">{{ t('subscriptions.aiModal.uploadImage') }}</n-button>
                  <n-button quaternary :disabled="loading || !imagePreview" @click="clearImage">{{ t('subscriptions.aiModal.clearImage') }}</n-button>
                </n-space>
                <div class="card-muted">{{ t('subscriptions.aiModal.pasteHint') }}</div>
                <img v-if="imagePreview" :src="imagePreview" :alt="t('subscriptions.aiModal.imagePreviewAlt')" class="ai-upload-box__preview" />
              </n-space>
            </div>
          </n-form-item>
        </n-form>
      </n-spin>

      <n-space justify="space-between">
        <div v-if="result" class="card-muted">
          {{ t('subscriptions.aiModal.confidenceWithValue', { value: ((result.confidence ?? 0) * 100).toFixed(0) }) }}
        </div>
        <n-space>
          <n-button :disabled="loading" @click="emit('close')">{{ t('common.actions.close') }}</n-button>
          <n-button type="primary" :loading="loading" :disabled="loading" @click="recognize">
            {{ loading ? t('subscriptions.aiModal.recognizing') : t('subscriptions.aiModal.recognize') }}
          </n-button>
          <n-button type="success" :disabled="!result || loading" @click="applyResult">{{ t('subscriptions.aiModal.applyResult') }}</n-button>
        </n-space>
      </n-space>

      <n-card v-if="result" size="small" embedded :title="t('subscriptions.aiModal.resultTitle')">
        <n-data-table :columns="resultColumns" :data="resultRows" :pagination="false" size="small" />

        <div v-if="result.rawText" class="ai-raw-text">
          <div class="ai-raw-text__title">{{ t('subscriptions.aiModal.rawTextTitle') }}</div>
          <pre class="ai-result">{{ result.rawText }}</pre>
        </div>
      </n-card>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref } from 'vue'
import { NAlert, NButton, NCard, NDataTable, NForm, NFormItem, NInput, NModal, NSpace, NSpin, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { api } from '@/composables/api'
import type { AiRecognitionResult } from '@/types/api'
import { getAiRecognitionStatusText } from '@/utils/ai-recognition-status'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  apply: [result: AiRecognitionResult]
}>()

const message = useMessage()
const { t } = useI18n()
const fileInputRef = ref<HTMLInputElement | null>(null)
const text = ref('')
const imageBase64 = ref('')
const imagePreview = ref('')
const imageFilename = ref('')
const imageMimeType = ref('image/png')
const loading = ref(false)
const result = ref<AiRecognitionResult | null>(null)
const loadingElapsedMs = ref(0)
let loadingTimer: ReturnType<typeof setInterval> | null = null

const intervalLabelMap: Record<string, string> = {
  day: 'common.units.day',
  week: 'common.units.week',
  month: 'common.units.month',
  quarter: 'common.units.quarter',
  year: 'common.units.year'
}

const resultRows = computed(() => {
  if (!result.value) return []

  const rows: Array<{ field: string; value: string }> = []
  const push = (field: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === '') return
    rows.push({ field, value: String(value) })
  }

  push('name', result.value.name)
  push('description', result.value.description)
  push('amount', result.value.amount !== undefined ? Number(result.value.amount).toFixed(2) : undefined)
  push('currency', result.value.currency)
  push('billingIntervalCount', result.value.billingIntervalCount)
  push(
    'billingIntervalUnit',
    result.value.billingIntervalUnit
      ? t(intervalLabelMap[result.value.billingIntervalUnit] ?? result.value.billingIntervalUnit)
      : undefined
  )
  push('startDate', result.value.startDate)
  push('nextRenewalDate', result.value.nextRenewalDate)
  push('notifyDaysBefore', result.value.notifyDaysBefore !== undefined ? `${result.value.notifyDaysBefore} ${t('common.units.day')}` : undefined)
  push('websiteUrl', result.value.websiteUrl)
  push('notes', result.value.notes)

  return rows
})

const resultColumns = computed(() => [
  {
    title: t('subscriptions.aiModal.field'),
    key: 'field',
    width: 150,
    render: (row: { field: string }) => t(`subscriptions.aiModal.fields.${row.field}`)
  },
  {
    title: t('subscriptions.aiModal.recognizedResult'),
    key: 'value',
    render: (row: { value: string }) => h('span', { class: 'ai-result-value' }, row.value)
  }
])

const loadingStatusText = computed(() =>
  getAiRecognitionStatusText({
    hasImage: Boolean(imageBase64.value),
    elapsedMs: loadingElapsedMs.value
  })
)

function handleUpdateShow(value: boolean) {
  if (!value && !loading.value) emit('close')
}

function handleMaskClick() {
  if (loading.value) return
  emit('close')
}

function startLoadingTimer() {
  loadingElapsedMs.value = 0
  stopLoadingTimer()
  loadingTimer = setInterval(() => {
    loadingElapsedMs.value += 1000
  }, 1000)
}

function stopLoadingTimer() {
  if (!loadingTimer) return
  clearInterval(loadingTimer)
  loadingTimer = null
}

function pickFile() {
  fileInputRef.value?.click()
}

function clearImage() {
  imageBase64.value = ''
  imagePreview.value = ''
  imageFilename.value = ''
}

function readFile(file: File) {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      imagePreview.value = raw
      imageBase64.value = raw.includes(',') ? raw.split(',')[1] : raw
      imageFilename.value = file.name
      imageMimeType.value = file.type || 'image/png'
      resolve()
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await readFile(file)
}

async function handlePaste(event: ClipboardEvent) {
  if (loading.value) return
  const file = event.clipboardData?.files?.[0]
  if (!file) return
  await readFile(file)
}

async function recognize() {
  if (!text.value.trim() && !imageBase64.value) {
    message.warning(t('subscriptions.aiModal.pleaseProvideInput'))
    return
  }

  loading.value = true
  startLoadingTimer()
  try {
    result.value = await api.recognizeSubscriptionByAi({
      text: text.value.trim() || undefined,
      imageBase64: imageBase64.value || undefined,
      filename: imageFilename.value || undefined,
      mimeType: imageMimeType.value || undefined
    })
    message.success(t('subscriptions.aiModal.recognitionCompleted'))
  } catch (error) {
    result.value = null
    message.error(error instanceof Error ? error.message : t('subscriptions.aiModal.recognitionFailed'))
  } finally {
    loading.value = false
    stopLoadingTimer()
  }
}

function applyResult() {
  if (!result.value) return
  emit('apply', result.value)
  emit('close')
}

onBeforeUnmount(() => {
  stopLoadingTimer()
})
</script>

<style scoped>
.hidden-input {
  display: none;
}

.ai-upload-box {
  width: 100%;
  padding: 12px;
  border: 1px dashed var(--app-border);
  border-radius: 12px;
  background: var(--app-surface);
}

.ai-upload-box__preview {
  max-width: 100%;
  max-height: 240px;
  border-radius: 10px;
  object-fit: contain;
  border: 1px solid var(--app-border-soft);
}

.ai-loading-copy {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  text-align: center;
}

.ai-loading-copy__primary {
  color: var(--app-text-strong);
  line-height: 1.6;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: break-word;
}

.ai-loading-copy__secondary {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  white-space: normal;
  word-break: keep-all;
}

.ai-raw-text {
  margin-top: 12px;
}

.ai-raw-text__title {
  margin-bottom: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.ai-result {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}

.ai-result-value {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
