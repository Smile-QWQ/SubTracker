<template>
  <n-modal :show="show" preset="card" title="恢复备份" style="width: min(960px, calc(100vw - 24px))" @update:show="handleShowUpdate">
    <n-space vertical :size="16" style="width: 100%">
      <n-alert type="info" :show-icon="false">
        该 ZIP 会恢复订阅、标签、支付记录、排序、系统设置与本地 Logo；不会恢复登录凭据、会话密钥、Webhook 历史和汇率快照
      </n-alert>

      <n-space align="center" wrap>
        <input
          ref="fileInputRef"
          type="file"
          accept=".zip,application/zip"
          class="hidden-input"
          @change="handleFileChange"
        />
        <n-button @click="pickFile">选择 ZIP 文件</n-button>
        <span class="file-name">{{ selectedFileName || '未选择文件' }}</span>
        <n-button type="primary" :disabled="!selectedFile" :loading="inspecting" @click="inspectFile">预览备份</n-button>
      </n-space>

      <template v-if="preview">
        <n-grid :cols="summaryCols" :x-gap="12" :y-gap="12">
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">订阅</div>
              <div class="summary-value">{{ preview.summary.subscriptionsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">标签</div>
              <div class="summary-value">{{ preview.summary.tagsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">支付记录</div>
              <div class="summary-value">{{ preview.summary.paymentRecordsTotal }}</div>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small">
              <div class="summary-label">本地 Logo</div>
              <div class="summary-value">{{ preview.summary.logosTotal }}</div>
            </n-card>
          </n-grid-item>
        </n-grid>

        <n-card title="恢复模式" size="small">
          <n-space vertical>
            <n-radio-group v-model:value="restoreMode">
              <n-space vertical>
                <n-radio value="replace">清空现有数据后恢复</n-radio>
                <n-radio value="append">保留现有数据并追加恢复</n-radio>
              </n-space>
            </n-radio-group>

            <n-alert v-if="restoreMode === 'replace'" type="warning" :show-icon="false">
              将删除当前实例中的订阅、标签、支付记录、排序、系统设置和本地 Logo，然后再按文件内容重新恢复
            </n-alert>

            <template v-else>
              <n-alert type="info" :show-icon="false">
                追加恢复时：同名标签会复用现有标签；订阅与支付记录按原始 ID 幂等跳过；系统设置是否覆盖由你单独选择
              </n-alert>
              <div class="switch-row">
                <n-switch v-model:value="restoreSettings" />
                <span class="switch-inline-label">同时覆盖当前系统设置</span>
              </div>
            </template>
          </n-space>
        </n-card>

        <n-card title="恢复预览" size="small">
          <n-space vertical :size="8">
            <div class="conflict-row">
              <span>现有同名标签：</span>
              <strong>{{ preview.conflicts.existingTagNameCount }}</strong>
            </div>
            <div class="conflict-row">
              <span>现有同 ID 订阅：</span>
              <strong>{{ preview.conflicts.existingSubscriptionIdCount }}</strong>
            </div>
            <div class="conflict-row">
              <span>现有同 ID 支付记录：</span>
              <strong>{{ preview.conflicts.existingPaymentRecordIdCount }}</strong>
            </div>
          </n-space>
        </n-card>

        <n-card title="警告信息" size="small">
          <ul class="warning-list">
            <li v-for="item in preview.warnings" :key="item">{{ item }}</li>
          </ul>
        </n-card>
      </template>

      <n-space justify="end">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" :disabled="!preview" :loading="committing" @click="commitImport">确认恢复</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NAlert, NButton, NCard, NGrid, NGridItem, NModal, NRadio, NRadioGroup, NSpace, NSwitch, useMessage } from 'naive-ui'
import { api } from '@/composables/api'
import type { SubtrackerBackupInspectResult } from '@/types/api'
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
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const preview = ref<SubtrackerBackupInspectResult | null>(null)
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
  restoreMode.value = 'replace'
  restoreSettings.value = false
}

function normalizePreviewErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/invalid zip data/i.test(error.message)) {
      return '备份 ZIP 无法解析'
    }
    return error.message
  }
  return '备份预览失败'
}

async function inspectFile() {
  if (!selectedFile.value) return

  inspecting.value = true
  try {
    const prepared = await buildPreparedSubtrackerBackupPayload(selectedFile.value)
    preview.value = await api.inspectSubtrackerBackup({
      filename: selectedFile.value.name,
      manifest: prepared.manifest,
      logoAssets: prepared.logoAssets
    })
    message.success('已生成备份预览')
  } catch (error) {
    preview.value = null
    message.error(normalizePreviewErrorMessage(error))
  } finally {
    inspecting.value = false
  }
}

async function commitImport() {
  if (!preview.value) return

  committing.value = true
  try {
    const result = await api.commitSubtrackerBackup({
      importToken: preview.value.importToken,
      mode: restoreMode.value,
      restoreSettings: restoreMode.value === 'replace' ? true : restoreSettings.value
    })
    message.success(
      `恢复完成：${result.importedSubscriptions} 条订阅，${result.importedTags} 个新标签，${result.importedPaymentRecords} 条支付记录，${result.importedLogos} 个 Logo`
    )
    emit('imported', {
      mode: result.mode,
      restoredSettings: result.restoredSettings
    })
    close()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '恢复失败')
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
