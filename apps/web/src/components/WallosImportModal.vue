<template>
  <n-modal :show="show" preset="card" title="导入 Wallos 数据" style="width: min(1080px, calc(100vw - 24px))" @update:show="handleShowUpdate">
    <n-space vertical :size="16" style="width: 100%">
      <n-alert type="info" :show-icon="false">
        支持上传 Wallos 的 JSON、SQLite 数据库或 ZIP 包。SQLite / ZIP 会先在浏览器端解析，再提交给 Worker 持久化。当前只导入实际被订阅使用到的标签。
      </n-alert>

      <n-space align="center" wrap>
        <input ref="fileInputRef" type="file" accept=".json,.db,.sqlite,.sqlite3,.zip,application/octet-stream,application/json,application/zip" class="hidden-input" @change="handleFileChange" />
        <n-button @click="pickFile">选择文件</n-button>
        <span class="file-name">{{ selectedFileName || '未选择文件' }}</span>
        <n-button type="primary" :disabled="!selectedFile" :loading="inspecting" @click="inspectFile">生成预览</n-button>
      </n-space>

      <n-alert v-if="showJsonImportWarning" type="warning" :show-icon="false">
        {{ JSON_IMPORT_WARNING_MESSAGE }}
      </n-alert>

      <template v-if="preview">
        <n-grid :cols="summaryCols" :x-gap="12" :y-gap="12">
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">导入类型</div>
              <div class="summary-value">{{ fileTypeText(preview.summary.fileType) }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">可导入订阅</div>
              <div class="summary-value">{{ preview.summary.supportedSubscriptions }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">实际导入标签</div>
              <div class="summary-value">{{ preview.summary.usedTagsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">ZIP Logo 匹配</div>
              <div class="summary-value">{{ preview.summary.zipLogoMatched }}/{{ preview.summary.zipLogoMatched + preview.summary.zipLogoMissing }}</div>
            </n-card>
          </n-grid-item>
        </n-grid>

        <n-card title="标签预览" size="small">
          <n-empty v-if="preview.usedTags.length === 0" description="没有可导入的标签" />
          <n-data-table v-else :columns="tagColumns" :data="preview.usedTags" :pagination="{ pageSize: 6 }" />
        </n-card>

        <n-card title="订阅预览" size="small">
          <n-data-table :columns="subscriptionColumns" :data="preview.subscriptionsPreview" :pagination="{ pageSize: 8 }" />
        </n-card>

        <n-card title="警告信息" size="small">
          <n-empty v-if="previewWarnings.length === 0" description="没有额外警告" />
          <template v-else>
            <div class="warning-header">
              <span>共 {{ previewWarnings.length }} 条警告</span>
              <n-button text type="primary" @click="warningsExpanded = !warningsExpanded">
                {{ warningsExpanded ? '收起' : '展开查看' }}
              </n-button>
            </div>
            <ul v-if="warningsExpanded" class="warning-list">
              <li v-for="item in previewWarnings" :key="item">{{ item }}</li>
            </ul>
          </template>
        </n-card>
      </template>

      <n-space justify="end">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" :disabled="!preview" :loading="committing" @click="commitImport">确认导入</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NAlert, NButton, NCard, NDataTable, NEmpty, NGrid, NGridItem, NModal, NSpace, NTag, useMessage } from 'naive-ui'
import { api } from '@/composables/api'
import { useSettingsQuery } from '@/composables/settings-query'
import type { WallosImportInspectResult, WallosImportSubscriptionPreview } from '@/types/api'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'
import { buildPreparedWallosImportPayload } from '@/utils/wallos-import-client'
import { JSON_IMPORT_WARNING_MESSAGE, shouldRecommendDbImport } from '@/utils/wallos-import'
import { formatDateInTimezone } from '@/utils/timezone'

const props = defineProps<{
  show: boolean
  defaultNotifyDays: number
  baseCurrency: string
}>()

const emit = defineEmits<{
  close: []
  imported: []
}>()

const { width } = useWindowSize()
const message = useMessage()
const fileInputRef = ref<HTMLInputElement | null>(null)
const { data: settings } = useSettingsQuery()
const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const preview = ref<WallosImportInspectResult | null>(null)
const inspecting = ref(false)
const committing = ref(false)
const warningsExpanded = ref(false)

const summaryCols = computed(() => (width.value < 700 ? 2 : 4))
const showJsonImportWarning = computed(() =>
  shouldRecommendDbImport(selectedFileName.value, preview.value?.summary.fileType)
)
const previewWarnings = computed(() => {
  if (!preview.value) return []
  return Array.from(new Set([...preview.value.warnings, ...preview.value.subscriptionsPreview.flatMap((item) => item.warnings)]))
})

const tagColumns = [
  { title: '来源 ID', key: 'sourceId' },
  { title: '标签名', key: 'name' },
  { title: '排序', key: 'sortOrder' }
]

const subscriptionColumns = [
  { title: '名称', key: 'name' },
  {
    title: '金额',
    key: 'amount',
    render: (row: WallosImportSubscriptionPreview) => `${row.currency} ${row.amount.toFixed(2)}`
  },
  {
    title: '频率',
    key: 'billingInterval',
    render: (row: WallosImportSubscriptionPreview) => `每 ${row.billingIntervalCount} ${unitText(row.billingIntervalUnit)}`
  },
  {
    title: '下次续订',
    key: 'nextRenewalDate',
    render: (row: WallosImportSubscriptionPreview) => formatDateInTimezone(row.nextRenewalDate, settings.value?.timezone)
  },
  {
    title: '标签',
    key: 'tagNames',
    render: (row: WallosImportSubscriptionPreview) => row.tagNames.join(' / ') || '未打标签'
  },
  {
    title: '自动续订',
    key: 'autoRenew',
    render: (row: WallosImportSubscriptionPreview) => (row.autoRenew ? '是' : '否')
  },
  {
    title: '状态',
    key: 'status',
    render: (row: WallosImportSubscriptionPreview) =>
      h(NTag, { type: getSubscriptionStatusTagType(row.status) }, { default: () => getSubscriptionStatusText(row.status) })
  },
  {
    title: 'Logo',
    key: 'logoImportStatus',
    render: (row: WallosImportSubscriptionPreview) =>
      ({
        none: '无',
        'pending-file-match': '待匹配',
        'ready-from-zip': 'ZIP 可导入'
      })[row.logoImportStatus]
  }
]

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
    const prepared = await buildPreparedWallosImportPayload(selectedFile.value, {
      defaultNotifyDays: props.defaultNotifyDays,
      baseCurrency: props.baseCurrency
    })
    preview.value = await api.inspectWallosImport(prepared)
    warningsExpanded.value = false
    message.success('已生成导入预览')
  } catch (error) {
    preview.value = null
    message.error(error instanceof Error ? error.message : '预览生成失败')
  } finally {
    inspecting.value = false
  }
}

async function commitImport() {
  if (!preview.value) return

  committing.value = true
  try {
    const result = await api.commitWallosImport(preview.value.importToken)
    message.success(`导入完成：${result.importedSubscriptions} 条订阅，${result.importedTags} 个标签，${result.importedLogos} 个 Logo`)
    emit('imported')
    close()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导入失败')
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
  }
}

function unitText(unit: WallosImportSubscriptionPreview['billingIntervalUnit']) {
  return {
    day: '天',
    week: '周',
    month: '月',
    quarter: '季',
    year: '年'
  }[unit]
}

function fileTypeText(type: WallosImportInspectResult['summary']['fileType']) {
  return {
    json: 'JSON',
    db: 'SQLite',
    zip: 'ZIP'
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
