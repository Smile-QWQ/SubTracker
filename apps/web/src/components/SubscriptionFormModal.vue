<template>
  <n-modal :show="show" preset="card" title="订阅信息" style="width: min(920px, calc(100vw - 24px))" @mask-click="close" @update:show="handleUpdateShow">
    <n-form :model="form" label-placement="top">
      <div class="name-logo-row">
        <n-form-item label="名称" class="name-logo-row__name">
          <n-input v-model:value="form.name" placeholder="例如：GitHub Pro" />
        </n-form-item>

        <div class="logo-dock">
          <div class="logo-dock__row">
            <div class="logo-dock__preview-wrap">
              <button type="button" class="logo-dock__preview" @click="pickLogoFile">
                <img v-if="resolvedLogoUrl" :src="resolvedLogoUrl" alt="logo" class="logo-dock__image" />
                <div v-else class="logo-dock__placeholder">
                  <span>{{ logoStorageEnabled ? (form.name.trim() ? '点击上传' : 'Logo') : '远程 Logo' }}</span>
                </div>
              </button>

              <button v-if="form.logoUrl" type="button" class="logo-dock__clear" @click.stop="clearLogo">
                <n-icon :component="CloseOutline" />
              </button>
            </div>

            <n-button circle tertiary type="primary" @click.stop="openLogoPanel">
              <template #icon>
                <n-icon :component="SearchOutline" />
              </template>
            </n-button>
          </div>

          <input ref="logoFileInputRef" type="file" accept="image/*" class="hidden-input" @change="handleLogoFileChange" />

          <div v-if="showLogoPanel" class="logo-panel">
            <div class="logo-panel__header">
              <span>选择 Logo</span>
              <button type="button" class="logo-panel__close" @click="showLogoPanel = false">
                <n-icon :component="CloseOutline" />
              </button>
            </div>

            <n-tabs v-model:value="logoPanelTab" type="segment" animated class="logo-panel__tabs">
              <n-tab-pane :name="LOGO_TAB_WEB" :tab="`网络搜索 (${logoCandidates.length})`">
                <div v-if="searchingLogoCandidates" class="logo-panel__state">
                  <n-spin size="small" />
                  <span>正在搜索 Logo...</span>
                </div>

                <div v-else-if="logoCandidates.length" class="logo-panel__list">
                  <button
                    v-for="item in logoCandidates"
                    :key="`${item.source}-${item.logoUrl}`"
                    type="button"
                    class="logo-panel__item"
                    @click="applyRemoteLogoCandidate(item)"
                  >
                    <img :src="item.logoUrl" :alt="item.label" class="logo-panel__item-image" />
                    <span class="logo-panel__item-label">{{ item.label }}</span>
                    <span class="logo-panel__item-meta">
                      {{ formatLogoSource(item.source) }}
                      <template v-if="item.width && item.height"> · {{ item.width }}×{{ item.height }}</template>
                    </span>
                  </button>
                </div>

                <n-empty v-else description="当前没有可用的网络搜索结果" size="small" class="logo-panel__empty" />
              </n-tab-pane>

              <n-tab-pane v-if="logoStorageEnabled" :name="LOGO_TAB_LIBRARY" :tab="`本地已保存 (${localLogoLibrary.length})`">
                <div v-if="loadingLocalLogoLibrary" class="logo-panel__state">
                  <n-spin size="small" />
                  <span>正在加载本地 Logo...</span>
                </div>

                <div v-else-if="localLogoLibrary.length" class="logo-panel__list">
                  <div v-for="item in localLogoLibrary" :key="item.logoUrl" class="logo-panel__item-wrap">
                    <button
                      v-if="(item.usageCount ?? 0) === 0 && item.filename"
                      type="button"
                      class="logo-panel__delete"
                      @click.stop="deleteLocalLogo(item)"
                    >
                      <n-icon :component="CloseOutline" />
                    </button>

                    <button type="button" class="logo-panel__item" @click="applyLocalLogoCandidate(item)">
                      <img :src="resolveLogoUrl(item.logoUrl)" :alt="item.label" class="logo-panel__item-image" />
                      <span class="logo-panel__item-label">{{ item.label }}</span>
                      <span class="logo-panel__item-meta">
                        {{ formatLogoSource(item.source) }}
                        <template v-if="item.usageCount !== undefined"> · 已用 {{ item.usageCount }} 次</template>
                      </span>
                      <span v-if="item.relatedSubscriptionNames?.length" class="logo-panel__item-related">
                        {{ item.relatedSubscriptionNames.join(' / ') }}
                      </span>
                    </button>
                  </div>
                </div>

                <n-empty v-else description="本地还没有可复用的 Logo" size="small" class="logo-panel__empty" />
              </n-tab-pane>
            </n-tabs>
          </div>
        </div>
      </div>

      <n-grid :cols="layoutCols" :x-gap="16" :y-gap="8">
        <n-grid-item>
          <n-form-item label="标签">
            <n-select v-model:value="form.tagIds" :options="tagOptions" multiple filterable clearable placeholder="选择标签" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="官网 / 平台地址">
            <n-input v-model:value="form.websiteUrl" placeholder="https://example.com" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-form-item label="描述">
        <n-input
          v-model:value="form.description"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="可选，简单记录订阅用途"
        />
      </n-form-item>

      <n-grid :cols="moneyCols" :x-gap="16" :y-gap="8">
        <n-grid-item>
          <n-form-item label="金额">
            <n-input-number v-model:value="form.amount" :min="0" :precision="2" style="width: 100%" placeholder="输入金额，免费可填 0" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="货币">
            <n-select v-model:value="form.currency" :options="currencyOptions" filterable placeholder="选择货币" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="频率">
            <n-select v-model:value="form.billingIntervalCount" :options="frequencyOptions" placeholder="选择频率" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="单位">
            <n-select v-model:value="form.billingIntervalUnit" :options="intervalOptions" placeholder="选择单位" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-grid :cols="dateCols" :x-gap="16" :y-gap="8">
        <n-grid-item>
          <n-form-item label="开始日期">
            <n-date-picker v-model:value="form.startDateTs" type="date" style="width: 100%" clearable />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="下次续订">
            <n-date-picker v-model:value="form.nextRenewalDateTs" type="date" style="width: 100%" clearable @update:value="handleNextRenewalDateChange" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item>
            <template #label>
              <span class="label-with-tip">
                <span>到期前提醒规则</span>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-icon class="label-with-tip__icon" :component="helpCircleOutline" />
                  </template>
                  <span>格式说明：天数&时间;，例如 3&09:30; 表示提前 3 天在 09:30 提醒，0&09:30; 表示到期当天提醒；多条规则用 ; 分隔，留空则沿用系统默认</span>
                </n-tooltip>
              </span>
            </template>
            <n-input v-model:value="form.advanceReminderRules" placeholder="留空则沿用系统默认，例如：3&09:30;0&09:30;" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item>
            <template #label>
              <span class="label-with-tip">
                <span>过期提醒规则</span>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-icon class="label-with-tip__icon" :component="helpCircleOutline" />
                  </template>
                  <span>格式说明：天数&时间;，例如 1&09:30; 表示过期 1 天后在 09:30 提醒；多条规则用 ; 分隔，留空则沿用系统默认</span>
                </n-tooltip>
              </span>
            </template>
            <n-input v-model:value="form.overdueReminderRules" placeholder="留空则沿用系统默认，例如：1&09:30;2&09:30;" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-form-item label="备注">
        <n-input
          v-model:value="form.notes"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="可选，记录账号、套餐或特别说明"
        />
      </n-form-item>

      <div class="form-footer">
        <n-space>
          <n-switch v-model:value="form.webhookEnabled" />
          <span>启用提醒通知</span>
          <n-switch v-model:value="form.autoRenew" />
          <span>自动续订</span>
        </n-space>
        <n-space wrap>
          <n-button @click="showAiModal = true">AI 识别</n-button>
          <n-button @click="handleReset">重置</n-button>
          <n-button @click="close">取消</n-button>
          <n-button type="primary" @click="submit">保存</n-button>
        </n-space>
      </div>
    </n-form>

    <subscription-ai-modal :show="showAiModal" @close="showAiModal = false" @apply="applyAiResult" />
  </n-modal>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, reactive, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import {
  NButton,
  NDatePicker,
  NEmpty,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
  NTooltip,
  useMessage
} from 'naive-ui'
import { CloseOutline, HelpCircleOutline, SearchOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import SubscriptionAiModal from '@/components/SubscriptionAiModal.vue'
import { buildCurrencyOptions } from '@/utils/currency'
import { resolveLogoUrl } from '@/utils/logo'
import type { AiRecognitionResult, LogoSearchResult, Subscription, Tag } from '@/types/api'

const LOGO_TAB_WEB = 'web'
const LOGO_TAB_LIBRARY = 'library'

const props = defineProps<{
  show: boolean
  model?: Subscription | null
  tags: Tag[]
  currencies?: string[]
  defaultAdvanceReminderRules?: string
  defaultOverdueReminderRules?: string
  logoStorageEnabled?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [payload: Record<string, unknown>, editingId?: string]
}>()

const logoStorageEnabled = computed(() => props.logoStorageEnabled ?? false)

const { width } = useWindowSize()
const message = useMessage()
const helpCircleOutline = HelpCircleOutline
const showAiModal = ref(false)
const showLogoPanel = ref(false)
const logoPanelTab = ref<string>(LOGO_TAB_WEB)
const searchingLogoCandidates = ref(false)
const loadingLocalLogoLibrary = ref(false)
const logoCandidates = ref<LogoSearchResult[]>([])
const localLogoLibrary = ref<LogoSearchResult[]>([])
const logoFileInputRef = ref<HTMLInputElement | null>(null)
const nextRenewalDirty = ref(false)
const syncingNextRenewal = ref(false)

const layoutCols = computed(() => (width.value < 700 ? 1 : 2))
const moneyCols = computed(() => (width.value < 900 ? 2 : 4))
const dateCols = computed(() => (width.value < 900 ? 1 : 2))

const intervalOptions = [
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '季', value: 'quarter' },
  { label: '年', value: 'year' }
]

const frequencyOptions = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1}`,
  value: index + 1
}))

const tagOptions = computed(() =>
  props.tags.map((item) => ({
    label: item.name,
    value: item.id
  }))
)

const currencyOptions = computed(() =>
  buildCurrencyOptions(props.currencies?.length ? props.currencies : ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'])
)

const form = reactive({
  name: '',
  tagIds: [] as string[],
  description: '',
  amount: null as number | null,
  currency: 'CNY',
  billingIntervalCount: 1,
  billingIntervalUnit: 'month',
  autoRenew: false,
  startDateTs: dayjs().valueOf(),
  nextRenewalDateTs: dayjs().add(1, 'month').valueOf(),
  advanceReminderRules: '',
  overdueReminderRules: '',
  webhookEnabled: true,
  notes: '',
  websiteUrl: '',
  logoUrl: '',
  logoSource: ''
})

const resolvedLogoUrl = computed(() => (form.logoUrl ? resolveLogoUrl(form.logoUrl) : ''))
watch(
  () => props.model,
  (model) => {
    if (!model) {
      resetForm()
      return
    }
    hydrateFromModel(model)
  },
  { immediate: true }
)

watch(
  () => props.show,
  (value) => {
    if (!value) {
      showLogoPanel.value = false
      searchingLogoCandidates.value = false
    }
  }
)

watch(
  () => [form.startDateTs, form.billingIntervalCount, form.billingIntervalUnit, props.model?.id] as const,
  () => {
    if (props.model || nextRenewalDirty.value || !form.startDateTs) return

    syncingNextRenewal.value = true
    form.nextRenewalDateTs = calculateNextRenewalTs(
      form.startDateTs,
      Number(form.billingIntervalCount),
      form.billingIntervalUnit as Subscription['billingIntervalUnit']
    )
    syncingNextRenewal.value = false
  }
)

function resetForm() {
  form.name = ''
  form.tagIds = []
  form.description = ''
  form.amount = null
  form.currency = 'CNY'
  form.billingIntervalCount = 1
  form.billingIntervalUnit = 'month'
  form.autoRenew = false
  form.startDateTs = dayjs().valueOf()
  form.nextRenewalDateTs = dayjs().add(1, 'month').valueOf()
  form.advanceReminderRules = ''
  form.overdueReminderRules = ''
  form.webhookEnabled = true
  form.notes = ''
  form.websiteUrl = ''
  form.logoUrl = ''
  form.logoSource = ''
  nextRenewalDirty.value = false
  logoCandidates.value = []
  showLogoPanel.value = false
}

function hydrateFromModel(model: Subscription) {
  form.name = model.name
  form.tagIds = model.tags?.map((item) => item.id) ?? []
  form.description = model.description
  form.amount = model.amount
  form.currency = model.currency
  form.billingIntervalCount = model.billingIntervalCount
  form.billingIntervalUnit = model.billingIntervalUnit
  form.autoRenew = model.autoRenew ?? false
  form.startDateTs = dayjs(model.startDate).valueOf()
  form.nextRenewalDateTs = dayjs(model.nextRenewalDate).valueOf()
  nextRenewalDirty.value = true
  form.advanceReminderRules = model.advanceReminderRules ?? ''
  form.overdueReminderRules = model.overdueReminderRules ?? ''
  form.webhookEnabled = model.webhookEnabled
  form.notes = model.notes
  form.websiteUrl = model.websiteUrl ?? ''
  form.logoUrl = model.logoUrl ?? ''
  form.logoSource = model.logoSource ?? ''
  logoCandidates.value = []
  showLogoPanel.value = false
}

function handleReset() {
  if (props.model) {
    hydrateFromModel(props.model)
    message.success('已重置为当前订阅内容')
    return
  }

  resetForm()
  message.success('已重置表单')
}

function calculateNextRenewalTs(startDateTs: number, intervalCount: number, unit: Subscription['billingIntervalUnit']) {
  const start = dayjs(startDateTs)
  const count = Math.max(Number(intervalCount) || 1, 1)

  switch (unit) {
    case 'day':
      return start.add(count, 'day').valueOf()
    case 'week':
      return start.add(count, 'week').valueOf()
    case 'month':
      return start.add(count, 'month').valueOf()
    case 'quarter':
      return start.add(count * 3, 'month').valueOf()
    case 'year':
      return start.add(count, 'year').valueOf()
    default:
      return start.add(1, 'month').valueOf()
  }
}

function handleNextRenewalDateChange(value: number | null) {
  if (value === null) return

  form.nextRenewalDateTs = value
  if (!syncingNextRenewal.value) {
    nextRenewalDirty.value = true
  }
}

async function openLogoPanel() {
  showLogoPanel.value = true
  if (logoStorageEnabled.value) {
    await loadLocalLogoLibrary()
  }

  if (!form.name.trim() && !form.websiteUrl.trim()) {
    logoPanelTab.value = logoStorageEnabled.value ? LOGO_TAB_LIBRARY : LOGO_TAB_WEB
    message.info(logoStorageEnabled.value ? '未填写名称或官网时，先为你展示本地已保存 Logo。' : '未启用 R2 时仅支持远程 Logo 引用。')
    return
  }

  logoPanelTab.value = LOGO_TAB_WEB
  await searchLogos()
}

async function searchLogos() {
  if (!form.name.trim() && !form.websiteUrl.trim()) {
    logoCandidates.value = []
    return
  }

  searchingLogoCandidates.value = true
  try {
    logoCandidates.value = await api.searchSubscriptionLogos({
      name: form.name.trim() || 'subscription',
      websiteUrl: form.websiteUrl.trim() || undefined,
      tagName: props.tags.find((item) => item.id === form.tagIds[0])?.name
    })

    if (!logoCandidates.value.length) {
      message.warning('没有找到可用 Logo')
    }
  } catch (error) {
    logoCandidates.value = []
    message.error(error instanceof Error ? error.message : 'Logo 搜索失败')
  } finally {
    searchingLogoCandidates.value = false
  }
}

async function loadLocalLogoLibrary(force = false) {
  if (loadingLocalLogoLibrary.value) return
  if (localLogoLibrary.value.length > 0 && !force) return

  loadingLocalLogoLibrary.value = true
  try {
    localLogoLibrary.value = await api.getSubscriptionLogoLibrary()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取本地 Logo 失败')
  } finally {
    loadingLocalLogoLibrary.value = false
  }
}

function pickLogoFile() {
  if (!logoStorageEnabled.value) {
    message.info('当前未启用 R2，不能上传本地 Logo，请使用网络搜索后的远程引用。')
    return
  }
  logoFileInputRef.value?.click()
}

async function applyRemoteLogoCandidate(item: LogoSearchResult) {
  try {
    const imported = await api.importSubscriptionLogo({
      logoUrl: item.logoUrl,
      source: item.source
    })

    form.logoUrl = imported.logoUrl
    form.logoSource = imported.logoSource
    if (item.websiteUrl && !form.websiteUrl) {
      form.websiteUrl = item.websiteUrl
    }

    showLogoPanel.value = false
    if (logoStorageEnabled.value) {
      await loadLocalLogoLibrary(true)
      message.success('已保存到本地并应用')
    } else {
      message.success('已应用远程 Logo 引用')
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Logo 导入失败')
  }
}

function applyLocalLogoCandidate(item: LogoSearchResult) {
  form.logoUrl = item.logoUrl
  form.logoSource = item.source
  showLogoPanel.value = false
  message.success('已从本地库复用')
}

async function deleteLocalLogo(item: LogoSearchResult) {
  if (!item.filename) return

  try {
    await api.deleteSubscriptionLogoFromLibrary(item.filename)
    localLogoLibrary.value = localLogoLibrary.value.filter((entry) => entry.logoUrl !== item.logoUrl)
    if (form.logoUrl === item.logoUrl) {
      form.logoUrl = ''
      form.logoSource = ''
    }
    message.success('本地 Logo 已删除')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除 Logo 失败')
  }
}

async function handleLogoFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (!logoStorageEnabled.value) {
    message.info('当前未启用 R2，不能上传本地 Logo，请使用网络搜索后的远程引用。')
    if (logoFileInputRef.value) {
      logoFileInputRef.value.value = ''
    }
    return
  }

  try {
    const base64 = await readFileAsBase64(file)
    const uploaded = await api.uploadSubscriptionLogo({
      filename: file.name,
      contentType: file.type,
      base64
    })

    form.logoUrl = uploaded.logoUrl
    form.logoSource = uploaded.logoSource
    await loadLocalLogoLibrary(true)
    message.success('Logo 上传成功')
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Logo 上传失败')
  } finally {
    if (logoFileInputRef.value) {
      logoFileInputRef.value.value = ''
    }
  }
}

function clearLogo() {
  form.logoUrl = ''
  form.logoSource = ''
}

function applyAiResult(result: AiRecognitionResult) {
  if (result.name) form.name = result.name
  if (result.description) form.description = result.description
  if (result.amount !== undefined) form.amount = result.amount
  if (result.currency) form.currency = result.currency
  if (result.billingIntervalCount) form.billingIntervalCount = result.billingIntervalCount
  if (result.billingIntervalUnit) form.billingIntervalUnit = result.billingIntervalUnit
  if (result.startDate) form.startDateTs = dayjs(result.startDate).valueOf()
  if (result.nextRenewalDate) {
    form.nextRenewalDateTs = dayjs(result.nextRenewalDate).valueOf()
    nextRenewalDirty.value = true
  }
  if (result.notifyDaysBefore !== undefined) {
    form.advanceReminderRules = `${result.notifyDaysBefore}&09:30;`
  }
  if (result.advanceReminderRules) form.advanceReminderRules = result.advanceReminderRules
  if (result.overdueReminderRules) form.overdueReminderRules = result.overdueReminderRules
  if (result.websiteUrl) form.websiteUrl = result.websiteUrl
  if (result.notes) form.notes = result.notes
}

function submit() {
  if (!form.name.trim()) {
    message.warning('请填写名称')
    return
  }
  if (form.amount === null || form.amount === undefined || Number(form.amount) < 0) {
    message.warning('请填写有效金额')
    return
  }

  emit(
    'submit',
    {
      name: form.name.trim(),
      tagIds: form.tagIds,
      description: form.description,
      amount: Number(form.amount ?? 0),
      currency: form.currency,
      billingIntervalCount: Number(form.billingIntervalCount),
      billingIntervalUnit: form.billingIntervalUnit,
      autoRenew: form.autoRenew,
      startDate: dayjs(form.startDateTs).format('YYYY-MM-DD'),
      nextRenewalDate: dayjs(form.nextRenewalDateTs).format('YYYY-MM-DD'),
      advanceReminderRules: form.advanceReminderRules.trim() || '',
      overdueReminderRules: form.overdueReminderRules.trim() || '',
      webhookEnabled: form.webhookEnabled,
      notes: form.notes,
      websiteUrl: form.websiteUrl || null,
      logoUrl: form.logoUrl || null,
      logoSource: form.logoSource || null
    },
    props.model?.id
  )
}

function close() {
  emit('close')
}

function handleUpdateShow(value: boolean) {
  if (!value) {
    close()
  }
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

function formatLogoSource(source: string) {
  const map: Record<string, string> = {
    upload: '本地上传',
    remote: '远程导入',
    'wallos-zip': 'Wallos ZIP',
    local: '本地库'
  }
  return map[source] ?? source
}
</script>

<style scoped>
.hidden-input {
  display: none;
}

.name-logo-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.name-logo-row__name {
  flex: 1 1 auto;
  min-width: 0;
}

.logo-dock {
  position: relative;
  flex: 0 0 148px;
  padding-top: 30px;
}

.logo-dock__row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.logo-dock__preview-wrap {
  position: relative;
}

.logo-dock__preview {
  width: 104px;
  height: 42px;
  padding: 6px 8px;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.logo-dock__preview:hover {
  border-color: #94a3b8;
  transform: translateY(-1px);
}

.logo-dock__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-dock__placeholder {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.02em;
}

.logo-dock__clear {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 20px;
  height: 20px;
  border: 1px solid #dbe2ea;
  border-radius: 999px;
  background: #fff;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.12);
}

.logo-panel {
  position: absolute;
  top: 78px;
  right: 0;
  width: min(320px, calc(100vw - 48px));
  max-height: 440px;
  padding: 10px;
  border: 1px solid #dbe2ea;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
  z-index: 20;
  overflow: hidden;
}

.logo-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 10px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.logo-panel__close {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}

.logo-panel__tabs {
  margin-top: 10px;
}

.logo-panel__state {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #64748b;
  font-size: 13px;
}

.logo-panel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 290px;
  overflow-y: auto;
  padding-right: 2px;
}

.logo-panel__item-wrap {
  position: relative;
}

.logo-panel__item {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.logo-panel__delete {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 22px;
  height: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}

.logo-panel__item:hover {
  border-color: #93c5fd;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.12);
  transform: translateY(-1px);
}

.logo-panel__item-image {
  width: 100%;
  height: 88px;
  object-fit: contain;
}

.logo-panel__item-label {
  width: 100%;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  text-align: center;
  line-height: 1.4;
  word-break: break-word;
}

.logo-panel__item-meta,
.logo-panel__item-related {
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

.logo-panel__item-related {
  color: #94a3b8;
}

.logo-panel__empty {
  margin-top: 10px;
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.label-with-tip__icon {
  color: #94a3b8;
  font-size: 15px;
  cursor: help;
}

@media (max-width: 900px) {
  .name-logo-row {
    flex-direction: column;
  }

  .logo-dock {
    width: 100%;
    flex: none;
    padding-top: 0;
  }

  .logo-dock__row {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .logo-panel {
    position: static;
    width: 100%;
    max-height: none;
    margin-top: 12px;
  }

  .form-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .form-footer :deep(.n-space) {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
