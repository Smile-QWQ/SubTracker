<template>
  <div>
    <n-space justify="space-between" align="start" class="page-top">
      <page-header title="订阅管理" subtitle="管理不同周期、不同币种的订阅" :icon="layersOutline" />
      <n-space>
        <n-button :type="batchMode ? 'primary' : 'default'" ghost @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </n-button>
        <n-button @click="showTagManageModal = true">
          <template #icon>
            <n-icon><pricetags-outline /></n-icon>
          </template>
          标签管理
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
          <n-select v-model:value="sortMode" placeholder="排序方式" :options="sortOptions" />
          <n-button @click="loadSubscriptions">
            <template #icon>
              <n-icon><search-outline /></n-icon>
            </template>
            查询
          </n-button>
          <n-button quaternary @click="showTagFilter = !showTagFilter">
            {{ showTagFilter ? '收起标签筛选' : '展开标签筛选' }}
          </n-button>
        </div>

        <n-space v-if="filters.tagIds.length" wrap>
          <n-tag
            v-for="tagId in filters.tagIds"
            :key="tagId"
            closable
            :bordered="false"
            :color="tagColor(tagId)"
            @close="removeFilterTag(tagId)"
          >
            {{ tagName(tagId) }}
          </n-tag>
        </n-space>

        <n-collapse-transition :show="showTagFilter">
          <div class="tag-filter-panel">
            <n-space wrap>
              <n-tag
                v-for="item in tags"
                :key="item.id"
                class="filter-tag"
                :bordered="!filters.tagIds.includes(item.id)"
                :color="filters.tagIds.includes(item.id) ? { color: item.color, textColor: '#fff' } : undefined"
                @click="toggleTagFilter(item.id)"
              >
                {{ item.name }}
              </n-tag>
            </n-space>
          </div>
        </n-collapse-transition>
      </n-space>
    </n-card>

    <n-card>
      <template #header>订阅列表</template>
      <template #header-extra>
        <n-button
          v-if="sortMode === 'custom' && !batchMode"
          size="small"
          :type="showDragHandles ? 'primary' : 'default'"
          ghost
          @click="toggleDragHandles"
        >
          {{ showDragHandles ? '完成调整' : '调整顺序' }}
        </n-button>
      </template>

      <n-space v-if="batchMode" justify="space-between" align="center" style="margin-bottom: 12px" wrap>
        <n-space align="center" wrap>
          <n-tag type="info">已选 {{ selectedCount }} 项</n-tag>
          <n-button size="small" :disabled="selectedCount === 0" @click="clearSelectedSubscriptions">清空选择</n-button>
        </n-space>
        <n-space wrap>
          <n-button size="small" type="primary" ghost :disabled="selectedCount === 0" @click="runBatchRenew">批量续订</n-button>
          <n-button size="small" :disabled="!canBatchPause" @click="runBatchPause">批量暂停</n-button>
          <n-button size="small" type="warning" ghost :disabled="!canBatchCancel" @click="runBatchCancel">批量取消</n-button>
          <n-button size="small" type="error" ghost :disabled="!canBatchDelete" @click="runBatchDelete">批量删除</n-button>
        </n-space>
      </n-space>

      <div v-if="isMobile" class="mobile-list">
        <n-empty v-if="orderedSubscriptions.length === 0" description="暂无订阅" />

        <n-card v-for="item in orderedSubscriptions" :key="item.id" size="small" class="mobile-subscription-card">
          <div class="mobile-subscription-card__header">
            <div class="mobile-subscription-card__title-wrap">
              <n-checkbox
                v-if="batchMode"
                :checked="selectedSubscriptionIds.includes(item.id)"
                @update:checked="toggleSelectedSubscription(item.id)"
              />
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

          <n-space wrap size="small" style="margin: 10px 0 6px">
            <n-tag
              v-for="tag in item.tags ?? []"
              :key="tag.id"
              size="small"
              :bordered="false"
              :color="{ color: tag.color, textColor: '#fff' }"
            >
              {{ tag.name }}
            </n-tag>
            <span v-if="!(item.tags?.length)" class="muted-text">未打标签</span>
          </n-space>

          <div class="mobile-subscription-card__rows">
            <div class="mobile-subscription-card__row">
              <span>下次续订</span>
              <span>{{ formatDate(item.nextRenewalDate) }}</span>
            </div>
            <div class="mobile-subscription-card__row">
              <span>自动续订</span>
              <span>{{ item.autoRenew ? '已启用' : '未启用' }}</span>
            </div>
          </div>

          <div v-if="item.notes?.trim()" class="note-strip">
            <n-icon :size="14"><document-text-outline /></n-icon>
            <span class="note-strip__label">备注：</span>
            <span class="note-strip__content">{{ item.notes.trim() }}</span>
          </div>

          <n-space v-if="!batchMode" wrap style="margin-top: 12px">
            <n-button size="small" @click="openDetail(item.id)">详情</n-button>
            <n-button size="small" @click="openRecords(item.id)">记录</n-button>
            <n-button size="small" @click="openEdit(item)">编辑</n-button>
            <n-button size="small" type="primary" ghost @click="quickRenew(item)">续订</n-button>
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
        :pagination="false"
        :row-key="rowKey"
        :row-props="getRowProps"
      />
      <div v-if="!isMobile" class="desktop-pagination">
        <n-pagination
          :page="currentPage"
          :page-size="desktopPageSize"
          :item-count="orderedSubscriptions.length"
          show-size-picker
          :page-sizes="[...SUBSCRIPTION_PAGE_SIZE_OPTIONS]"
          @update:page="currentPage = $event"
          @update:page-size="
            (pageSize) => {
              desktopPageSize = pageSize
              currentPage = 1
              setStoredSubscriptionPageSize(pageSize)
            }
          "
        />
      </div>
    </n-card>

    <subscription-form-modal
      :show="showModal"
      :model="editing"
      :saving="savingSubscription"
      :tags="tags"
      :currencies="currencies"
      :default-advance-reminder-rules="defaultAdvanceReminderRules"
      :default-overdue-reminder-rules="defaultOverdueReminderRules"
      :logo-storage-enabled="settings?.storageCapabilities?.logoStorageEnabled ?? false"
      @close="closeModal"
      @submit="submitSubscription"
    />

    <tag-manage-modal
      :show="showTagManageModal"
      :tags="tags"
      :subscription-counts="tagSubscriptionCounts"
      @close="showTagManageModal = false"
      @create="createTag"
      @update="updateTag"
      @delete="deleteTag"
    />

    <subscription-detail-drawer :show="showDetailDrawer" :detail="detail" @close="showDetailDrawer = false" />
    <subscription-payment-records-drawer :show="showPaymentDrawer" :records="paymentRecords" @close="showPaymentDrawer = false" />
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  NButton,
  NCard,
  NCheckbox,
  NCollapseTransition,
  NDataTable,
  NEmpty,
  NIcon,
  NInput,
  NPagination,
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
import { useExchangeRateSnapshotQuery } from '@/composables/exchange-rate-query'
import { useSettingsQuery } from '@/composables/settings-query'
import { TAGS_QUERY_KEY, useTagsQuery } from '@/composables/tags-query'
import TagManageModal from '@/components/TagManageModal.vue'
import PageHeader from '@/components/PageHeader.vue'
import SubscriptionDetailDrawer from '@/components/SubscriptionDetailDrawer.vue'
import SubscriptionFormModal from '@/components/SubscriptionFormModal.vue'
import SubscriptionPaymentRecordsDrawer from '@/components/SubscriptionPaymentRecordsDrawer.vue'
import type { PaymentRecord, Settings, Subscription, SubscriptionDetail, Tag } from '@/types/api'
import { resolveLogoUrl } from '@/utils/logo'
import { createSingleFlight } from '@/utils/single-flight'
import {
  DEFAULT_SUBSCRIPTION_PAGE_SIZE,
  SUBSCRIPTION_PAGE_SIZE_OPTIONS,
  getStoredSubscriptionPageSize,
  setStoredSubscriptionPageSize
} from '@/utils/subscription-pagination'
import { buildSubscriptionTableRows, paginateSubscriptions, type SubscriptionTableRow } from '@/utils/subscription-table'

type SortMode = 'custom' | 'renewal' | 'amount-desc' | 'name'

const message = useMessage()
const { width } = useWindowSize()
const queryClient = useQueryClient()
const layersOutline = LayersOutline
const isMobile = computed(() => width.value < 960)

const subscriptions = ref<Subscription[]>([])
const tags = ref<Tag[]>([])
const { data: settings } = useSettingsQuery()
const { data: tagsQueryData } = useTagsQuery()
const { data: snapshotQueryData } = useExchangeRateSnapshotQuery()
const detail = ref<SubscriptionDetail | null>(null)
const paymentRecords = ref<PaymentRecord[]>([])
const currencies = ref<string[]>(['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'])
const defaultAdvanceReminderRules = ref('3&09:30;0&09:30;')
const defaultOverdueReminderRules = ref('1&09:30;2&09:30;3&09:30;')

const filters = reactive({
  q: '',
  status: null as string | null,
  tagIds: [] as string[]
})
const appliedFilters = reactive({
  q: '',
  status: null as string | null,
  tagIds: [] as string[]
})

const sortMode = ref<SortMode>('custom')
const showModal = ref(false)
const showTagManageModal = ref(false)
const showDetailDrawer = ref(false)
const showPaymentDrawer = ref(false)
const showTagFilter = ref(false)
const editing = ref<Subscription | null>(null)
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
const armedDragId = ref<string | null>(null)
const savingOrder = ref(false)
const savingSubscription = ref(false)
const showDragHandles = ref(false)
const currentPage = ref(1)
const desktopPageSize = ref<number>(DEFAULT_SUBSCRIPTION_PAGE_SIZE)
const batchMode = ref(false)
const selectedSubscriptionIds = ref<string[]>([])

const statusOptions = [
  { label: '正常', value: 'active' },
  { label: '暂停', value: 'paused' },
  { label: '停用', value: 'cancelled' },
  { label: '过期', value: 'expired' }
]

const sortOptions = [
  { label: '自定义顺序', value: 'custom' },
  { label: '按下次续订', value: 'renewal' },
  { label: '按金额从高到低', value: 'amount-desc' },
  { label: '按名称', value: 'name' }
]

const tagSubscriptionCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const subscription of subscriptions.value) {
    for (const tag of subscription.tags ?? []) {
      counts[tag.id] = (counts[tag.id] ?? 0) + 1
    }
  }
  return counts
})

const hasActiveFilters = computed(() => Boolean(filters.q || filters.status || filters.tagIds.length))
const canDragReorder = computed(
  () =>
    sortMode.value === 'custom' &&
    !batchMode.value &&
    showDragHandles.value &&
    !hasActiveFilters.value &&
    subscriptions.value.length > 1 &&
    !savingOrder.value &&
    !isMobile.value
)
const dragHandleVisible = computed(() => sortMode.value === 'custom' && !batchMode.value && showDragHandles.value && !isMobile.value)
const selectedSubscriptions = computed(() =>
  subscriptions.value.filter((item) => selectedSubscriptionIds.value.includes(item.id))
)
const selectedCount = computed(() => selectedSubscriptionIds.value.length)
const canBatchPause = computed(
  () => selectedCount.value > 0 && selectedSubscriptions.value.every((item) => item.status === 'active')
)
const canBatchCancel = computed(
  () => selectedCount.value > 0 && selectedSubscriptions.value.every((item) => item.status === 'active')
)
const canBatchDelete = computed(
  () => selectedCount.value > 0 && selectedSubscriptions.value.every((item) => item.status !== 'active')
)
const subscriptionQueryParams = computed(() => ({
  q: appliedFilters.q || undefined,
  status: appliedFilters.status || undefined,
  tagIds: appliedFilters.tagIds.length ? appliedFilters.tagIds.join(',') : undefined
}))
const subscriptionsQuery = useQuery({
  queryKey: computed(() => ['subscriptions', subscriptionQueryParams.value]),
  queryFn: () => api.getSubscriptions(subscriptionQueryParams.value),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false
})

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
const pagedSubscriptions = computed(() =>
  paginateSubscriptions(orderedSubscriptions.value, currentPage.value, desktopPageSize.value)
)

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
        class: ['drag-handle-cell', 'drag-handle-cell--enabled', canDragReorder.value ? 'drag-handle-cell--active' : ''].join(' ').trim(),
        title: canDragReorder.value ? '拖拽调整顺序' : '当前排序不可拖拽',
        onMousedown: () => armDrag(row.id),
        onMouseup: resetArmedDrag
      },
      [h(NIcon, { size: 18 }, { default: () => h(ReorderThreeOutline) })]
    )
  }
}

const selectionColumn = {
  title: '',
  key: 'select',
  width: 52,
  colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
  render: (row: SubscriptionTableRow) => {
    if (row.__rowType === 'note') return null

    return h(NCheckbox, {
      checked: selectedSubscriptionIds.value.includes(row.id),
      'onUpdate:checked': () => toggleSelectedSubscription(row.id)
    })
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

const tagListStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px'
}

const mainColumns = [
  {
    title: '名称',
    key: 'name',
    colSpan: (row: SubscriptionTableRow) =>
      row.__rowType === 'note' ? (batchMode.value ? 8 : dragHandleVisible.value ? 8 : 7) : 1,
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') {
        return h('div', { style: noteContainerStyle }, [
          h(NIcon, { size: 14 }, { default: () => h(DocumentTextOutline) }),
          h('span', { style: noteLabelStyle }, '备注：'),
          h('span', { style: noteContentStyle }, row.note)
        ])
      }

      return h('div', { style: nameCellStyle }, [
        row.logoUrl
          ? h('img', {
              src: resolveLogoUrl(row.logoUrl),
              alt: row.name,
              style: logoImageStyle
            })
          : h('div', { style: logoFallbackStyle }, row.name.slice(0, 1).toUpperCase()),
        h('div', { style: nameTitleStyle }, row.name)
      ])
    }
  },
  {
    title: '标签',
    key: 'tags',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') return null
      if (!(row.tags?.length)) return '未打标签'

      return h(
        'div',
        { style: tagListStyle },
        row.tags.slice(0, 3).map((tag) =>
          h(
            NTag,
            {
              size: 'small',
              bordered: false,
              color: { color: tag.color, textColor: '#fff' }
            },
            { default: () => tag.name }
          )
        )
      )
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
    title: '下次续订',
    key: 'nextRenewalDate',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? null : formatDate(row.nextRenewalDate))
  },
  {
    title: '状态',
    key: 'status',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) =>
      row.__rowType === 'note' ? null : h(NTag, { type: statusTagType(row.status) }, { default: () => statusText(row.status) })
  },
  {
    title: '操作',
    key: 'actions',
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') return null

      return h(NSpace, { size: 6, wrapItem: false }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => void openDetail(row.id) }, { default: () => '详情' }),
          h(NButton, { size: 'small', onClick: () => void openRecords(row.id) }, { default: () => '记录' }),
          h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => void quickRenew(row) }, { default: () => '续订' }),
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

const columns = computed(() => {
  const result = [...mainColumns]
  if (batchMode.value) {
    return [selectionColumn, ...result]
  }
  if (dragHandleVisible.value) {
    return [dragColumn, ...result]
  }
  return result
})
const tableRows = computed<SubscriptionTableRow[]>(() => buildSubscriptionTableRows(pagedSubscriptions.value))

onMounted(() => {
  desktopPageSize.value = getStoredSubscriptionPageSize()
  window.addEventListener('mouseup', resetArmedDrag)
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', resetArmedDrag)
})

watch(sortMode, (value) => {
  if (value !== 'custom') {
    showDragHandles.value = false
    resetDragState()
  }
  currentPage.value = 1
})

watch(
  () => orderedSubscriptions.value.length,
  (count) => {
    const maxPage = Math.max(1, Math.ceil(count / desktopPageSize.value))
    if (currentPage.value > maxPage) {
      currentPage.value = maxPage
    }
  }
)

async function loadSubscriptions() {
  resetDragState()
  currentPage.value = 1
  const nextTagIds = [...filters.tagIds]
  const filtersChanged =
    appliedFilters.q !== filters.q ||
    appliedFilters.status !== filters.status ||
    appliedFilters.tagIds.length !== nextTagIds.length ||
    appliedFilters.tagIds.some((id, index) => id !== nextTagIds[index])

  appliedFilters.q = filters.q
  appliedFilters.status = filters.status
  appliedFilters.tagIds = nextTagIds

  if (!filtersChanged) {
    await subscriptionsQuery.refetch()
  }
}

watch(
  () => subscriptionsQuery.data.value,
  (value) => {
    subscriptions.value = value ?? []
    const existingIds = new Set(subscriptions.value.map((item) => item.id))
    selectedSubscriptionIds.value = selectedSubscriptionIds.value.filter((id) => existingIds.has(id))
  },
  { immediate: true }
)

watch(
  tagsQueryData,
  (value) => {
    tags.value = value ?? []
  },
  { immediate: true }
)

watch(
  snapshotQueryData,
  (value) => {
    if (!value) return
    currencies.value = Array.from(new Set([value.baseCurrency, ...Object.keys(value.rates)])).sort()
  },
  { immediate: true }
)

watch(
  settings,
  (value) => {
    if (!value) return
    defaultAdvanceReminderRules.value = value.defaultAdvanceReminderRules
    defaultOverdueReminderRules.value = value.defaultOverdueReminderRules
  },
  { immediate: true }
)

function toggleTagFilter(tagId: string) {
  if (filters.tagIds.includes(tagId)) {
    filters.tagIds = filters.tagIds.filter((item) => item !== tagId)
  } else {
    filters.tagIds = [...filters.tagIds, tagId]
  }
}

function removeFilterTag(tagId: string) {
  filters.tagIds = filters.tagIds.filter((item) => item !== tagId)
  void loadSubscriptions()
}

function tagName(tagId: string) {
  return tags.value.find((item) => item.id === tagId)?.name ?? tagId
}

function tagColor(tagId: string) {
  const tag = tags.value.find((item) => item.id === tagId)
  return tag ? { color: tag.color, textColor: '#fff' } : undefined
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

async function openRecords(id: string) {
  paymentRecords.value = await api.getSubscriptionPaymentRecords(id)
  showPaymentDrawer.value = true
}

function closeModal() {
  showModal.value = false
}

async function refetchCurrentSubscriptions() {
  await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
  await subscriptionsQuery.refetch()
}

const submitSubscriptionTask = createSingleFlight(async (payload: Record<string, unknown>, editingId?: string) => {
  savingSubscription.value = true
  try {
    if (editingId) {
      await api.updateSubscription(editingId, payload)
      message.success('订阅已更新')
    } else {
      await api.createSubscription(payload)
      message.success('订阅已创建')
    }

    closeModal()
    await refetchCurrentSubscriptions()
  } catch (error) {
    message.error(`保存失败：${error instanceof Error ? error.message : 'Unknown'}`)
  } finally {
    savingSubscription.value = false
  }
})

function submitSubscription(payload: Record<string, unknown>, editingId?: string) {
  return submitSubscriptionTask.run(payload, editingId)
}

async function createTag(payload: { name: string; color: string; icon: string; sortOrder: number }) {
  try {
    await api.createTag(payload)
    message.success('标签已创建')
    await Promise.all([queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }), refetchCurrentSubscriptions()])
  } catch (error) {
    message.error(`标签创建失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

async function updateTag(payload: { name: string; color: string; icon: string; sortOrder: number }, id: string) {
  try {
    await api.updateTag(id, payload)
    message.success('标签已更新')
    await Promise.all([queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }), refetchCurrentSubscriptions()])
  } catch (error) {
    message.error(`标签更新失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

async function deleteTag(tag: Tag) {
  try {
    await api.deleteTag(tag.id)
    message.success(`已删除标签：${tag.name}`)
    filters.tagIds = filters.tagIds.filter((item) => item !== tag.id)
    await Promise.all([queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }), loadSubscriptions()])
  } catch (error) {
    message.error(`标签删除失败：${error instanceof Error ? error.message : 'Unknown'}`)
  }
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (batchMode.value) {
    showDragHandles.value = false
    resetDragState()
  } else {
    clearSelectedSubscriptions()
  }
}

function toggleSelectedSubscription(id: string) {
  if (selectedSubscriptionIds.value.includes(id)) {
    selectedSubscriptionIds.value = selectedSubscriptionIds.value.filter((item) => item !== id)
  } else {
    selectedSubscriptionIds.value = [...selectedSubscriptionIds.value, id]
  }
}

function clearSelectedSubscriptions() {
  selectedSubscriptionIds.value = []
}

function ensureBatchSelection() {
  if (!selectedCount.value) {
    message.warning('请先选择订阅')
    return false
  }
  return true
}

function summarizeBatchResult(label: string, result: { successCount: number; failureCount: number }) {
  if (result.failureCount === 0) {
    message.success(`${label}成功，共 ${result.successCount} 项`)
    return
  }

  message.warning(`${label}完成：成功 ${result.successCount} 项，失败 ${result.failureCount} 项`)
}

async function refreshOpenDetailIfNeeded(ids: string[]) {
  if (detail.value?.id && ids.includes(detail.value.id)) {
    detail.value = await api.getSubscription(detail.value.id)
  }
}

async function runBatchRenew() {
  if (!ensureBatchSelection()) return
  const ids = [...selectedSubscriptionIds.value]
  const result = await api.batchRenewSubscriptions(ids)
  summarizeBatchResult('批量续订', result)
  await refetchCurrentSubscriptions()
  await refreshOpenDetailIfNeeded(ids)
}

async function runBatchPause() {
  if (!ensureBatchSelection() || !canBatchPause.value) return
  if (!window.confirm(`确认批量暂停已选的 ${selectedCount.value} 项订阅吗？`)) return
  const ids = [...selectedSubscriptionIds.value]
  const result = await api.batchPauseSubscriptions(ids)
  summarizeBatchResult('批量暂停', result)
  await refetchCurrentSubscriptions()
  await refreshOpenDetailIfNeeded(ids)
}

async function runBatchCancel() {
  if (!ensureBatchSelection() || !canBatchCancel.value) return
  if (!window.confirm(`确认批量取消已选的 ${selectedCount.value} 项订阅吗？`)) return
  const ids = [...selectedSubscriptionIds.value]
  const result = await api.batchCancelSubscriptions(ids)
  summarizeBatchResult('批量取消', result)
  await refetchCurrentSubscriptions()
  await refreshOpenDetailIfNeeded(ids)
}

async function runBatchDelete() {
  if (!ensureBatchSelection() || !canBatchDelete.value) return
  if (!window.confirm(`确认批量删除已选的 ${selectedCount.value} 项订阅吗？此操作不可恢复。`)) return
  const result = await api.batchDeleteSubscriptions(selectedSubscriptionIds.value)
  summarizeBatchResult('批量删除', result)
  if (detail.value && selectedSubscriptionIds.value.includes(detail.value.id)) {
    detail.value = null
    showDetailDrawer.value = false
  }
  clearSelectedSubscriptions()
  await refetchCurrentSubscriptions()
}

async function quickRenew(row: Subscription) {
  await api.renewSubscription(row.id)
  message.success(`已续订：${row.name}`)
  await refetchCurrentSubscriptions()
  if (detail.value?.id === row.id) {
    detail.value = await api.getSubscription(row.id)
  }
}

async function pause(id: string) {
  await api.pauseSubscription(id)
  message.success('已暂停')
  await refetchCurrentSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function cancel(id: string) {
  await api.cancelSubscription(id)
  message.success('已停用')
  await refetchCurrentSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function removeSubscription(id: string, name: string) {
  await api.deleteSubscription(id)
  message.success(`已删除：${name}`)
  await refetchCurrentSubscriptions()
  if (detail.value?.id === id) {
    detail.value = null
    showDetailDrawer.value = false
  }
}

function rowKey(row: SubscriptionTableRow) {
  return row.id
}

function getRowProps(row: SubscriptionTableRow) {
  const targetId = row.__rowType === 'main' ? row.id : row.subscriptionId

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
  if (!canDragReorder.value || !draggingId.value || draggingId.value === targetId) return
  event.preventDefault()

  const currentIds = orderedSubscriptions.value.map((item) => item.id)
  const fromIndex = currentIds.indexOf(draggingId.value)
  const toIndex = currentIds.indexOf(targetId)
  if (fromIndex < 0 || toIndex < 0) return

  const nextIds = [...currentIds]
  const [moved] = nextIds.splice(fromIndex, 1)
  nextIds.splice(toIndex, 0, moved)

  try {
    savingOrder.value = true
    await api.reorderSubscriptions(nextIds)
    await refetchCurrentSubscriptions()
    message.success('顺序已更新')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '排序更新失败')
  } finally {
    savingOrder.value = false
    resetDragState()
  }
}

function armDrag(id: string) {
  if (!canDragReorder.value) return
  armedDragId.value = id
}

function resetArmedDrag() {
  armedDragId.value = null
}

function resetDragState() {
  draggingId.value = null
  dragOverId.value = null
  armedDragId.value = null
}

function toggleDragHandles() {
  showDragHandles.value = !showDragHandles.value
  resetDragState()

  if (showDragHandles.value) {
    message.info('已开启拖拽排序，仅拖拽手柄可调整顺序')
  }
}

function statusText(status: Subscription['status']) {
  return {
    active: '正常',
    paused: '暂停',
    cancelled: '停用',
    expired: '过期'
  }[status]
}

function statusTagType(status: Subscription['status']) {
  return {
    active: 'success',
    paused: 'warning',
    cancelled: 'error',
    expired: 'error'
  }[status] as 'default' | 'success' | 'warning' | 'error'
}

function formatDate(value: string) {
  return dayjs(value).format('YYYY-MM-DD')
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
</script>

<style scoped>
.page-top {
  margin-bottom: 12px;
}

.filters-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) 160px 180px auto auto;
  gap: 12px;
}

.tag-filter-panel {
  padding-top: 4px;
}

.filter-tag {
  cursor: pointer;
}

.mobile-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-subscription-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
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
  color: #64748b;
  font-size: 12px;
  margin-top: 4px;
}

.mobile-subscription-card__rows {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.mobile-subscription-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #334155;
}

.subscription-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: contain;
  border: 1px solid #e5e7eb;
  background: #fff;
}

.subscription-logo--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 700;
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
  margin-top: 12px;
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

.muted-text {
  color: #94a3b8;
  font-size: 12px;
}

.desktop-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

:deep(.subscription-row--draggable td) {
  transition: background-color 0.2s ease;
}

:deep(.subscription-row--dragging td) {
  opacity: 0.6;
}

:deep(.subscription-row--drag-over td) {
  background: #eff6ff;
}

.drag-handle-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #64748b;
}

.drag-handle-cell--active {
  cursor: grab;
}

@media (max-width: 1100px) {
  .filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
