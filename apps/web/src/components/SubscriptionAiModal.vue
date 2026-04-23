<template>
  <n-modal
    :show="show"
    preset="card"
    title="AI 识别订阅"
    style="width: min(720px, calc(100vw - 24px))"
    :mask-closable="!loading"
    :closable="!loading"
    @mask-click="handleMaskClick"
    @update:show="handleUpdateShow"
  >
    <n-space vertical>
      <n-alert type="info" :show-icon="false">
        支持输入文本、上传图片或直接粘贴截图。若当前模型未启用视觉输入能力，请切换到支持图片识别的模型后再试。识别结果只会回填表单，不会自动保存。
      </n-alert>

      <n-spin :show="loading" size="small">
        <template #description>
          <div class="ai-loading-copy">
            <div class="ai-loading-copy__primary">{{ loadingStatusText }}</div>
            <div class="ai-loading-copy__secondary">完成后会自动展示识别结果，无需重复点击。</div>
          </div>
        </template>

        <n-form label-placement="top">
          <n-form-item label="文本内容">
            <n-input
              v-model:value="text"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="粘贴订阅邮件、支付记录、订单文本等"
              :disabled="loading"
            />
          </n-form-item>

          <n-form-item label="图片">
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
                  <n-button :disabled="loading" @click="pickFile">上传图片</n-button>
                  <n-button quaternary :disabled="loading || !imagePreview" @click="clearImage">清空图片</n-button>
                </n-space>
                <div class="card-muted">也可以直接在此区域粘贴截图</div>
                <img v-if="imagePreview" :src="imagePreview" alt="识别图片预览" class="ai-upload-box__preview" />
              </n-space>
            </div>
          </n-form-item>
        </n-form>
      </n-spin>

      <n-space justify="space-between">
        <div v-if="result" class="card-muted">置信度：{{ ((result.confidence ?? 0) * 100).toFixed(0) }}%</div>
        <n-space>
          <n-button :disabled="loading" @click="emit('close')">关闭</n-button>
          <n-button type="primary" :loading="loading" :disabled="loading" @click="recognize">
            {{ loading ? '识别中…' : '开始识别' }}
          </n-button>
          <n-button type="success" :disabled="!result || loading" @click="applyResult">应用结果</n-button>
        </n-space>
      </n-space>

      <n-card v-if="result" size="small" embedded title="识别结果">
        <n-data-table :columns="resultColumns" :data="resultRows" :pagination="false" size="small" />

        <div v-if="result.rawText" class="ai-raw-text">
          <div class="ai-raw-text__title">原始提取文本</div>
          <pre class="ai-result">{{ result.rawText }}</pre>
        </div>
      </n-card>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref } from 'vue'
import { NAlert, NButton, NCard, NDataTable, NForm, NFormItem, NInput, NModal, NSpace, NSpin, useMessage } from 'naive-ui'
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

const fieldLabels: Record<string, string> = {
  name: '名称',
  description: '描述',
  amount: '金额',
  currency: '币种',
  billingIntervalCount: '频率',
  billingIntervalUnit: '周期单位',
  startDate: '开始日期',
  nextRenewalDate: '下次续订',
  notifyDaysBefore: '提醒天数',
  websiteUrl: '官网 / 平台地址',
  notes: '备注'
}

const intervalLabelMap: Record<string, string> = {
  day: '天',
  week: '周',
  month: '月',
  quarter: '季度',
  year: '年'
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
      ? intervalLabelMap[result.value.billingIntervalUnit] ?? result.value.billingIntervalUnit
      : undefined
  )
  push('startDate', result.value.startDate)
  push('nextRenewalDate', result.value.nextRenewalDate)
  push('notifyDaysBefore', result.value.notifyDaysBefore !== undefined ? `${result.value.notifyDaysBefore} 天` : undefined)
  push('websiteUrl', result.value.websiteUrl)
  push('notes', result.value.notes)

  return rows
})

const resultColumns = [
  {
    title: '字段',
    key: 'field',
    width: 150,
    render: (row: { field: string }) => fieldLabels[row.field] ?? row.field
  },
  {
    title: '识别结果',
    key: 'value',
    render: (row: { value: string }) => h('span', { class: 'ai-result-value' }, row.value)
  }
]

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
    message.warning('请先输入文本或上传图片')
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
    message.success('识别完成')
  } catch (error) {
    result.value = null
    message.error(error instanceof Error ? error.message : 'AI 识别失败')
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
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.ai-upload-box__preview {
  max-width: 100%;
  max-height: 240px;
  border-radius: 10px;
  object-fit: contain;
  border: 1px solid #e5e7eb;
}

.ai-loading-copy {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  text-align: center;
}

.ai-loading-copy__primary {
  color: #0f172a;
  line-height: 1.6;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: break-word;
}

.ai-loading-copy__secondary {
  margin-top: 4px;
  color: #64748b;
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
  color: #64748b;
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
