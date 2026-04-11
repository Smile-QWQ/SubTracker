<template>
  <n-modal :show="show" preset="card" title="AI 识别订阅" style="width: 720px" @mask-click="emit('close')" @update:show="handleUpdateShow">
    <n-space vertical>
      <n-alert type="info" :show-icon="false">
        支持输入文本、上传图片或直接粘贴截图。若当前模型不支持图片识别，将自动回退到本地 OCR 提取文本后再交给模型清洗。识别结果只会回填表单，不会自动保存。
      </n-alert>

      <n-form label-placement="top">
        <n-form-item label="文本内容">
          <n-input
            v-model:value="text"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="粘贴订阅邮件、支付记录、订单文本等"
          />
        </n-form-item>

        <n-form-item label="图片">
          <div class="ai-upload-box" @paste="handlePaste">
            <input ref="fileInputRef" type="file" accept="image/*" class="hidden-input" @change="handleFileChange" />
            <n-space vertical>
              <n-space>
                <n-button @click="pickFile">上传图片</n-button>
                <n-button quaternary @click="clearImage">清空图片</n-button>
              </n-space>
              <div class="card-muted">也可以直接在此区域粘贴截图</div>
              <img v-if="imagePreview" :src="imagePreview" alt="识别图片预览" class="ai-upload-box__preview" />
            </n-space>
          </div>
        </n-form-item>
      </n-form>

      <n-space justify="space-between">
        <div v-if="result" class="card-muted">置信度：{{ ((result.confidence ?? 0) * 100).toFixed(0) }}%</div>
        <n-space>
          <n-button @click="emit('close')">关闭</n-button>
          <n-button type="primary" :loading="loading" @click="recognize">开始识别</n-button>
          <n-button type="success" :disabled="!result" @click="applyResult">应用结果</n-button>
        </n-space>
      </n-space>

      <n-card v-if="result" size="small" embedded title="识别结果">
        <pre class="ai-result">{{ prettyResult }}</pre>
      </n-card>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NCard, NForm, NFormItem, NInput, NModal, NSpace, useMessage } from 'naive-ui'
import { api } from '@/composables/api'
import type { AiRecognitionResult } from '@/types/api'

const props = defineProps<{
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

const prettyResult = computed(() => JSON.stringify(result.value, null, 2))

function handleUpdateShow(value: boolean) {
  if (!value) emit('close')
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
  }
}

function applyResult() {
  if (!result.value) return
  emit('apply', result.value)
  emit('close')
}
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

.ai-result {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}
</style>
