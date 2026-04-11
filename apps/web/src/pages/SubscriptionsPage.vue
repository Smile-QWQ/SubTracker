<template>
  <div>
    <n-space justify="space-between" align="start" class="page-top">
      <page-header title="订阅管理" subtitle="管理不同周期、不同币种的订阅" :icon="layersOutline" />
      <n-space>
        <n-button @click="showCategoryManageModal = true">
          <template #icon>
            <n-icon><pricetags-outline /></n-icon>
          </template>
          分类管理
        </n-button>
        <n-button type="primary" @click="openCreate">
          <template #icon>
            <n-icon><add-circle-outline /></n-icon>
          </template>
          新建订阅
        </n-button>
      </n-space>
    </n-space>

    <n-card style="margin-bottom: 12px">
      <n-space vertical :size="12" style="width: 100%">
        <div class="filters-grid">
          <n-input v-model:value="filters.q" placeholder="搜索名称/描述" clearable />
          <n-select v-model:value="filters.status" clearable placeholder="状态" :options="statusOptions" />
          <n-select v-model:value="filters.categoryId" clearable placeholder="分类" :options="categoryOptions" />
          <n-select v-model:value="sortMode" placeholder="排序方式" :options="sortOptions" />
          <n-button @click="loadSubscriptions">
            <template #icon>
              <n-icon><search-outline /></n-icon>
            </template>
            查询
          </n-button>
        </div>

        <n-space wrap>
          <n-tag
            :bordered="filters.categoryId !== null"
            :type="filters.categoryId === null ? 'primary' : 'default'"
            class="filter-tag"
            @click="toggleCategory(null)"
          >
            全部分类
          </n-tag>
          <n-tag
            v-for="item in categories"
            :key="item.id"
            class="filter-tag"
            :bordered="filters.categoryId !== item.id"
            :color="filters.categoryId === item.id ? { color: item.color, textColor: '#fff' } : undefined"
            @click="toggleCategory(item.id)"
          >
            {{ item.name }}
          </n-tag>
        </n-space>
      </n-space>
    </n-card>

    <n-card>
      <template #header>订阅列表</template>
      <template #header-extra>
        <n-button v-if="sortMode === 'custom'" size="small" :type="showDragHandles ? 'primary' : 'default'" ghost @click="toggleDragHandles">
          {{ showDragHandles ? '完成调整' : '调整顺序' }}
        </n-button>
      </template>

      <div v-if="isMobile" class="mobile-list">
        <n-empty v-if="orderedSubscriptions.length === 0" description="暂无订阅" />

        <n-card v-for="item in orderedSubscriptions" :key="item.id" size="small" class="mobile-subscription-card">
          <div class="mobile-subscription-card__header">
            <div class="mobile-subscription-card__title-wrap">
              <img v-if="item.logoUrl" :src="resolveLogoUrl(item.logoUrl)" :alt="item.name" class="subscription-logo" />
              <div v-else class="subscription-logo subscription-logo--placeholder">
                {{ item.name.slice(0, 1).toUpperCase() }}
              </div>

              <div class="mobile-subscription-card__title-group">
                <div class="mobile-subscription-card__title">{{ item.name }}</div>
                <div class="mobile-subscription-card__meta">
                  {{ item.currency }} {{ Number(item.amount).toFixed(2) }} · 每 {{ item.billingIntervalCount }} {{ unitLabel(item.billingIntervalUnit) }}
                </div>
              </div>
            </div>

            <n-tag :type="statusTagType(item.status)">{{ statusText(item.status) }}</n-tag>
          </div>

          <div class="mobile-subscription-card__rows">
            <div class="mobile-subscription-card__row">
              <span>分类</span>
              <span class="category-inline">
                <span v-if="item.category" class="category-dot" :style="{ background: item.category.color }"></span>
                {{ item.category?.name ?? '未分类' }}
              </span>
            </div>
            <div class="mobile-subscription-card__row">
              <span>下次续费</span>
              <span>{{ formatDate(item.nextRenewalDate) }}</span>
            </div>
          </div>

          <div v-if="item.notes?.trim()" class="note-strip">
            <n-icon :size="14"><document-text-outline /></n-icon>
            <span class="note-strip__label">备注：</span>
            <span class="note-strip__content">{{ item.notes.trim() }}</span>
          </div>

          <n-space wrap style="margin-top: 12px">
            <n-button size="small" @click="openDetail(item.id)">详情</n-button>
            <n-button size="small" @click="openEdit(item)">编辑</n-button>
            <n-button size="small" type="primary" ghost @click="quickRenew(item)">续费</n-button>
            <n-popconfirm positive-text="确认" negative-text="取消" @positive-click="pause(item.id)">
              <template #trigger>
                <n-button size="small" :disabled="item.status !== 'active'">暂停</n-button>
              </template>
              确认暂停该订阅？
            </n-popconfirm>
            <n-popconfirm
              v-if="item.status === 'active'"
              positive-text="确认"
              negative-text="取消"
              @positive-click="cancel(item.id)"
            >
              <template #trigger>
                <n-button size="small" type="error" ghost>取消</n-button>
              </template>
              确认取消该订阅？
            </n-popconfirm>
            <n-popconfirm
              v-else
              positive-text="删除"
              negative-text="保留"
              @positive-click="removeSubscription(item.id, item.name)"
            >
              <template #trigger>
                <n-button size="small" type="error" ghost>删除</n-button>
              </template>
              该订阅已停用，确认彻底删除？
            </n-popconfirm>
          </n-space>
        </n-card>
      </div>

      <n-data-table
        v-else
        :columns="columns"
        :data="tableRows"
        :pagination="{ pageSize: 10 }"
        :row-key="rowKey"
        :row-props="getRowProps"
      />
    </n-card>

    <subscription-form-modal
      :show="showModal"
      :model="editing"
      :categories="categories"
      :currencies="currencies"
      :default-notify-days="defaultNotifyDays"
      @close="closeModal"
      @submit="submitSubscription"
    />

    <category-manage-modal
      :show="showCategoryManageModal"
      :categories="categories"
      :subscription-counts="categorySubscriptionCounts"
      @close="showCategoryManageModal = false"
      @create="createCategory"
      @update="updateCategory"
      @delete="deleteCategory"
    />

    <subscription-detail-drawer :show="showDetailDrawer" :detail="detail" @close="showDetailDrawer = false" />
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import {
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NIcon,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui'
import {
  AddCircleOutline,
  DocumentTextOutline,
  LayersOutline,
  PricetagsOutline,
  ReorderThreeOutline,
  SearchOutline
} from '@vicons/ionicons5'
import { api } from '@/composables/api'
import CategoryManageModal from '@/components/CategoryManageModal.vue'
import PageHeader from '@/components/PageHeader.vue'
import SubscriptionDetailDrawer from '@/components/SubscriptionDetailDrawer.vue'
import SubscriptionFormModal from '@/components/SubscriptionFormModal.vue'
import type { Category, Settings, Subscription, SubscriptionDetail } from '@/types/api'
import { resolveLogoUrl } from '@/utils/logo'

type SortMode = 'custom' | 'renewal' | 'amount-desc' | 'name'

type SubscriptionTableRow =
  | (Subscription & { __rowType: 'main' })
  | {
      id: string
      __rowType: 'note'
      note: string
      subscriptionId: string
    }

const message = useMessage()
const { width } = useWindowSize()
const layersOutline = LayersOutline
const isMobile = computed(() => width.value < 960)

const subscriptions = ref<Subscription[]>([])
const categories = ref<Category[]>([])
const detail = ref<SubscriptionDetail | null>(null)
const currencies = ref<string[]>(['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'])
const defaultNotifyDays = ref(3)

const filters = reactive({
  q: '',
  status: null as string | null,
  categoryId: null as string | null
})

const sortMode = ref<SortMode>('custom')
const showModal = ref(false)
const showCategoryManageModal = ref(false)
const showDetailDrawer = ref(false)
const editing = ref<Subscription | null>(null)
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
const armedDragId = ref<string | null>(null)
const savingOrder = ref(false)
const showDragHandles = ref(false)

const statusOptions = [
  { label: '正常', value: 'active' },
  { label: '暂停', value: 'paused' },
  { label: '停用', value: 'cancelled' },
  { label: '过期', value: 'expired' }
]

const sortOptions = [
  { label: '自定义顺序', value: 'custom' },
  { label: '按下次续费', value: 'renewal' },
  { label: '按金额从高到低', value: 'amount-desc' },
  { label: '按名称', value: 'name' }
]

const categoryOptions = computed(() =>
  categories.value.map((item) => ({
    label: item.name,
    value: item.id
  }))
)

const categorySubscriptionCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const subscription of subscriptions.value) {
    if (!subscription.categoryId) continue
    counts[subscription.categoryId] = (counts[subscription.categoryId] ?? 0) + 1
  }
  return counts
})

const hasActiveFilters = computed(() => Boolean(filters.q || filters.status || filters.categoryId))
const canDragReorder = computed(
  () =>
    sortMode.value === 'custom' &&
    showDragHandles.value &&
    !hasActiveFilters.value &&
    subscriptions.value.length > 1 &&
    !savingOrder.value &&
    !isMobile.value
)
const dragHandleVisible = computed(() => sortMode.value === 'custom' && showDragHandles.value && !isMobile.value)

const orderedSubscriptions = computed(() => {
  const rows = [...subscriptions.value]

  switch (sortMode.value) {
    case 'renewal':
      return rows.sort(
        (a, b) =>
          dayjs(a.nextRenewalDate).valueOf() - dayjs(b.nextRenewalDate).valueOf() ||
          dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf()
      )
    case 'amount-desc':
      return rows.sort((a, b) => Number(b.amount) - Number(a.amount))
    case 'name':
      return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    case 'custom':
    default:
      return rows
  }
})

const baseColumnCount = computed(() => (dragHandleVisible.value ? 8 : 7))

const dragColumn = {
  title: '',
  key: 'sort',
  width: 56,
  colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
  render: (row: SubscriptionTableRow) => {
    if (row.__rowType === 'note') return null

    return h(
      'div',
      {
        class: ['drag-handle-cell', 'drag-handle-cell--enabled', canDragReorder.value ? 'drag-handle-cell--active' : '']
          .join(' ')
          .trim(),
        title: canDragReorder.value ? '拖拽调整顺序' : '当前排序不可拖拽',
        onMousedown: () => armDrag(row.id),
        onMouseup: resetArmedDrag
      },
      [h(NIcon, { size: 18 }, { default: () => h(ReorderThreeOutline) })]
    )
  }
}

const logoImageStyle = {
  width: '28px',
  height: '28px',
  borderRadius: '8px',
  objectFit: 'contain',
  border: '1px solid #e5e7eb',
  background: '#fff',
  flexShrink: '0'
}

const logoFallbackStyle = {
  width: '28px',
  height: '28px',
  borderRadius: '8px',
  background: '#eff6ff',
  color: '#2563eb',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: '700',
  flexShrink: '0'
}

const noteContainerStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: '#f8fafc',
  border: '1px solid #eef2f7',
  borderRadius: '6px',
  color: '#334155',
  fontSize: '12px'
} as const

const noteLabelStyle = {
  fontWeight: '600',
  color: '#475569',
  flexShrink: '0'
}

const noteContentStyle = {
  minWidth: '0',
  wordBreak: 'break-all',
  lineHeight: '1.5'
} as const

const nameCellStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
}

const nameTitleStyle = {
  fontWeight: '600',
  color: '#0f172a'
}

const categoryInlineStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px'
}

const categoryDotBaseStyle = {
  width: '10px',
  height: '10px',
  borderRadius: '999px',
  flexShrink: '0',
  boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.06)'
}

const mainColumns = [
  {
    title: '名称',
    key: 'name',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? baseColumnCount.value : 1),
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') {
        return h(
          'div',
          { style: noteContainerStyle },
          [
            h(NIcon, { size: 14 }, { default: () => h(DocumentTextOutline) }),
            h('span', { style: noteLabelStyle }, '备注：'),
            h('span', { style: noteContentStyle }, row.note)
          ]
        )
      }

      return h(
        'div',
        { style: nameCellStyle },
        [
          row.logoUrl
            ? h('img', {
                src: resolveLogoUrl(row.logoUrl),
                alt: row.name,
                style: logoImageStyle
              })
            : h('div', { style: logoFallbackStyle }, row.name.slice(0, 1).toUpperCase()),
          h('div', { style: nameTitleStyle }, row.name)
        ]
      )
    }
  },
  {
    title: '分类',
    key: 'category',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') return null
      if (!row.category) return '未分类'

      return h('div', { style: categoryInlineStyle }, [
        h('span', {
          style: { ...categoryDotBaseStyle, background: row.category.color }
        }),
        h('span', row.category.name)
      ])
    }
  },
  {
    title: '金额',
    key: 'amount',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? null : `${row.currency} ${Number(row.amount).toFixed(2)}`)
  },
  {
    title: '频率',
    key: 'interval',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) =>
      row.__rowType === 'note' ? null : `每 ${row.billingIntervalCount} ${unitLabel(row.billingIntervalUnit)}`
  },
  {
    title: '下次续费',
    key: 'nextRenewalDate',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? null : formatDate(row.nextRenewalDate))
  },
  {
    title: '状态',
    key: 'status',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) =>
      row.__rowType === 'note'
        ? null
        : h(NTag, { type: statusTagType(row.status) }, { default: () => statusText(row.status) })
  },
  {
    title: '操作',
    key: 'actions',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') return null

      return h(NSpace, { size: 6, wrapItem: false }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => void openDetail(row.id) }, { default: () => '详情' }),
          h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => void quickRenew(row) }, { default: () => '续费' }),
          h(
            NPopconfirm,
            { positiveText: '确认', negativeText: '取消', onPositiveClick: () => void pause(row.id) },
            {
              trigger: () => h(NButton, { size: 'small', disabled: row.status !== 'active' }, { default: () => '暂停' }),
              default: () => '确认暂停该订阅？'
            }
          ),
          row.status === 'active'
            ? h(
                NPopconfirm,
                { positiveText: '确认', negativeText: '取消', onPositiveClick: () => void cancel(row.id) },
                {
                  trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '取消' }),
                  default: () => '确认取消该订阅？'
                }
              )
            : h(
                NPopconfirm,
                { positiveText: '删除', negativeText: '保留', onPositiveClick: () => void removeSubscription(row.id, row.name) },
                {
                  trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
                  default: () => '该订阅已停用，确认彻底删除？'
                }
              )
        ]
      })
    }
  }
]

const columns = computed(() => (dragHandleVisible.value ? [dragColumn, ...mainColumns] : mainColumns))

const tableRows = computed<SubscriptionTableRow[]>(() =>
  orderedSubscriptions.value.flatMap((item) => {
    const rows: SubscriptionTableRow[] = [{ ...item, __rowType: 'main' }]
    if (item.notes?.trim()) {
      rows.push({
        id: `${item.id}__note`,
        __rowType: 'note',
        note: item.notes.trim(),
        subscriptionId: item.id
      })
    }
    return rows
  })
)

onMounted(async () => {
  window.addEventListener('mouseup', resetArmedDrag)
  await Promise.all([loadCategories(), loadSubscriptions(), loadCurrencies(), loadSettings()])
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', resetArmedDrag)
})

watch(sortMode, (value) => {
  if (value !== 'custom') {
    showDragHandles.value = false
    resetDragState()
  }
})

async function loadCategories() {
  categories.value = await api.getCategories()
}

async function loadSubscriptions() {
  resetDragState()
  subscriptions.value = await api.getSubscriptions({
    q: filters.q || undefined,
    status: filters.status || undefined,
    categoryId: filters.categoryId || undefined
  })
}

async function loadCurrencies() {
  const snapshot = await api.getExchangeRateSnapshot()
  currencies.value = Array.from(new Set([snapshot.baseCurrency, ...Object.keys(snapshot.rates)])).sort()
}

async function loadSettings() {
  const settings: Settings = await api.getSettings()
  defaultNotifyDays.value = settings.defaultNotifyDays ?? 3
}

async function toggleCategory(categoryId: string | null) {
  filters.categoryId = filters.categoryId === categoryId ? null : categoryId
  await loadSubscriptions()
}

function openCreate() {
  editing.value = null
  showModal.value = true
}

function openEdit(row: Subscription) {
  editing.value = row
  showModal.value = true
}

async function openDetail(id: string) {
  detail.value = await api.getSubscription(id)
  showDetailDrawer.value = true
}

function closeModal() {
  showModal.value = false
}

async function submitSubscription(payload: Record<string, unknown>, editingId?: string) {
  try {
    if (editingId) {
      await api.updateSubscription(editingId, payload)
      message.success('订阅已更新')
    } else {
      await api.createSubscription(payload)
      message.success('订阅已创建')
    }

    closeModal()
    await loadSubscriptions()
  } catch (error) {
    message.error(`保存失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

async function createCategory(payload: { name: string; color: string; icon: string; sortOrder: number }) {
  try {
    await api.createCategory(payload)
    message.success('分类已创建')
    await Promise.all([loadCategories(), loadSubscriptions()])
  } catch (error) {
    message.error(`分类创建失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

async function updateCategory(payload: { name: string; color: string; icon: string; sortOrder: number }, id: string) {
  try {
    await api.updateCategory(id, payload)
    message.success('分类已更新')
    await Promise.all([loadCategories(), loadSubscriptions()])
  } catch (error) {
    message.error(`分类更新失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

async function deleteCategory(category: Category) {
  try {
    await api.deleteCategory(category.id)
    message.success(`已删除分类：${category.name}`)
    if (filters.categoryId === category.id) {
      filters.categoryId = null
    }
    await Promise.all([loadCategories(), loadSubscriptions()])
  } catch (error) {
    message.error(`分类删除失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

async function quickRenew(row: Subscription) {
  await api.renewSubscription(row.id)
  message.success(`已续费：${row.name}`)
  await loadSubscriptions()
  if (detail.value?.id === row.id) {
    detail.value = await api.getSubscription(row.id)
  }
}

async function pause(id: string) {
  await api.pauseSubscription(id)
  message.success('已暂停')
  await loadSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function cancel(id: string) {
  await api.cancelSubscription(id)
  message.success('已停用')
  await loadSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function removeSubscription(id: string, name: string) {
  await api.deleteSubscription(id)
  message.success(`已删除：${name}`)
  await loadSubscriptions()
  if (detail.value?.id === id) {
    detail.value = null
    showDetailDrawer.value = false
  }
}

function rowKey(row: SubscriptionTableRow) {
  return row.id
}

function resolveSubscriptionId(row: SubscriptionTableRow) {
  return row.__rowType === 'main' ? row.id : row.subscriptionId
}

function getRowProps(row: SubscriptionTableRow) {
  const targetId = resolveSubscriptionId(row)

  return {
    draggable: canDragReorder.value && row.__rowType === 'main' && armedDragId.value === targetId,
    class: [
      canDragReorder.value && row.__rowType === 'main' ? 'subscription-row--draggable' : '',
      draggingId.value === targetId ? 'subscription-row--dragging' : '',
      dragOverId.value === targetId ? 'subscription-row--drag-over' : ''
    ]
      .filter(Boolean)
      .join(' '),
    onDragstart: row.__rowType === 'main' ? (event: DragEvent) => handleDragStart(event, targetId) : undefined,
    onDragover: (event: DragEvent) => handleDragOver(event, targetId),
    onDrop: (event: DragEvent) => {
      void handleDrop(event, targetId)
    },
    onDragend: resetDragState
  }
}

function handleDragStart(event: DragEvent, subscriptionId: string) {
  if (!canDragReorder.value || armedDragId.value !== subscriptionId) return

  draggingId.value = subscriptionId
  dragOverId.value = null

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', subscriptionId)
  }
}

function handleDragOver(event: DragEvent, subscriptionId: string) {
  if (!canDragReorder.value || !draggingId.value) return
  event.preventDefault()
  if (subscriptionId !== draggingId.value) {
    dragOverId.value = subscriptionId
  }
}

async function handleDrop(event: DragEvent, targetId: string) {
  if (!canDragReorder.value) return
  event.preventDefault()

  const sourceId = draggingId.value ?? event.dataTransfer?.getData('text/plain') ?? null
  if (!sourceId || sourceId === targetId) {
    resetDragState()
    return
  }

  const next = reorderSubscriptions(sourceId, targetId)
  if (!next) {
    resetDragState()
    return
  }

  subscriptions.value = next
  savingOrder.value = true

  try {
    await api.reorderSubscriptions(next.map((item) => item.id))
    message.success('顺序已更新')
  } catch (error) {
    message.error(`保存顺序失败：${error instanceof Error ? error.message : 'Unknown'}`)
    await loadSubscriptions()
  } finally {
    savingOrder.value = false
    resetDragState()
  }
}

function reorderSubscriptions(sourceId: string, targetId: string) {
  const next = [...subscriptions.value]
  const sourceIndex = next.findIndex((item) => item.id === sourceId)
  const targetIndex = next.findIndex((item) => item.id === targetId)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null

  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

function resetDragState() {
  draggingId.value = null
  dragOverId.value = null
  armedDragId.value = null
}

function armDrag(subscriptionId: string) {
  if (!canDragReorder.value) return
  armedDragId.value = subscriptionId
}

function resetArmedDrag() {
  if (!draggingId.value) {
    armedDragId.value = null
  }
}

function toggleDragHandles() {
  if (showDragHandles.value) {
    showDragHandles.value = false
    resetDragState()
    return
  }

  if (sortMode.value !== 'custom') {
    message.warning('请先切换到“自定义顺序”再调整。')
    return
  }
  if (hasActiveFilters.value) {
    message.warning('当前存在筛选条件，请先清空筛选后再调整顺序。')
    return
  }
  if (subscriptions.value.length <= 1) {
    message.warning('至少需要两条订阅，才能进行拖拽排序。')
    return
  }

  showDragHandles.value = true
  message.info('已开启拖拽排序，仅拖拽手柄可调整顺序。')
}

function unitLabel(unit: string) {
  return {
    day: '天',
    week: '周',
    month: '月',
    quarter: '季',
    year: '年'
  }[unit] ?? unit
}

function statusTagType(status: string): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'cancelled':
    case 'expired':
      return 'error'
    default:
      return 'default'
  }
}

function statusText(status: string) {
  switch (status) {
    case 'active':
      return '正常'
    case 'paused':
      return '暂停'
    case 'cancelled':
      return '停用'
    case 'expired':
      return '过期'
    default:
      return status
  }
}

function formatDate(value: string) {
  return dayjs(value).format('YYYY-MM-DD')
}
</script>

<style scoped>
.page-top {
  margin-bottom: 12px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.filter-tag {
  cursor: pointer;
  user-select: none;
}

.mobile-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subscription-logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid #e5e7eb;
  background: #fff;
  flex-shrink: 0;
}

.subscription-logo--placeholder {
  background: #eff6ff;
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.category-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.category-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06);
}

.note-strip {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 6px;
  color: #334155;
  font-size: 12px;
}

.note-strip__label {
  font-weight: 600;
  color: #475569;
  flex-shrink: 0;
}

.note-strip__content {
  min-width: 0;
  word-break: break-all;
  line-height: 1.5;
}

.mobile-subscription-card {
  border-radius: 14px;
}

.mobile-subscription-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mobile-subscription-card__title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mobile-subscription-card__title-group {
  min-width: 0;
}

.mobile-subscription-card__title {
  font-weight: 700;
  color: #0f172a;
}

.mobile-subscription-card__meta {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.mobile-subscription-card__rows {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-subscription-card__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #334155;
}

:deep(.subscription-row--draggable td) {
  cursor: default;
}

:deep(.subscription-row--dragging td) {
  opacity: 0.72;
}

:deep(.subscription-row--drag-over td) {
  background: #eff6ff;
}

.drag-handle-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: transparent;
  background: transparent;
  opacity: 0;
  transition: all 0.2s ease;
  cursor: default;
  pointer-events: none;
}

.drag-handle-cell--enabled {
  pointer-events: auto;
}

.drag-handle-cell--active {
  color: #64748b;
}

:deep(.subscription-row--draggable td:first-child:hover .drag-handle-cell--enabled),
:deep(.subscription-row--dragging .drag-handle-cell--enabled) {
  opacity: 1;
}

:deep(.subscription-row--draggable td:first-child:hover .drag-handle-cell--active),
:deep(.subscription-row--dragging .drag-handle-cell--active) {
  color: #2563eb;
  background: #eff6ff;
}

.drag-handle-cell--active:hover {
  cursor: grab;
}

:deep(.subscription-row--dragging td) {
  cursor: grabbing;
}

@media (max-width: 1180px) {
  .filters-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .page-top {
    align-items: stretch;
  }
}

@media (max-width: 640px) {
  .filters-grid {
    grid-template-columns: 1fr;
  }

  .mobile-subscription-card__header {
    flex-direction: column;
  }

  .mobile-subscription-card__row {
    align-items: center;
  }
}
</style>
