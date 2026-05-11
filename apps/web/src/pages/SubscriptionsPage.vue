<template>
  <div>
    <n-space justify="space-between" align="start" class="page-top">
      <page-header :title="t('subscriptions.page.title')" :subtitle="t('subscriptions.page.subtitle')" :icon="layersOutline" />
      <n-space>
        <n-button :type="batchMode ? 'primary' : 'default'" ghost @click="toggleBatchMode">
          {{ batchMode ? t('subscriptions.page.exitBatchMode') : t('subscriptions.page.batchMode') }}
        </n-button>
        <n-button @click="showTagManageModal = true">
          <template #icon>
            <n-icon><pricetags-outline /></n-icon>
          </template>
          {{ t('subscriptions.actions.tagManagement') }}
        </n-button>
        <n-button type="primary" @click="openCreate">
          <template #icon>
            <n-icon><add-circle-outline /></n-icon>
          </template>
          {{ t('subscriptions.actions.create') }}
        </n-button>
      </n-space>
    </n-space>

    <n-card style="margin-bottom: 12px">
      <n-space vertical :size="12" style="width: 100%">
        <div class="filters-grid">
          <n-input
            v-model:value="filters.q"
            :placeholder="t('subscriptions.page.searchPlaceholder')"
            clearable
            @keyup.enter="loadSubscriptions"
          />
          <n-select
            v-model:value="filters.status"
            clearable
            :placeholder="t('subscriptions.page.statusPlaceholder')"
            :options="statusOptions"
          />
          <n-select v-model:value="sortMode" :placeholder="t('subscriptions.page.sortPlaceholder')" :options="sortOptions" />
          <n-button @click="loadSubscriptions">
            <template #icon>
              <n-icon><search-outline /></n-icon>
            </template>
            {{ t('common.actions.search') }}
          </n-button>
          <n-button quaternary @click="showTagFilter = !showTagFilter">
            {{ showTagFilter ? t('subscriptions.page.collapseTagFilter') : t('subscriptions.page.expandTagFilter') }}
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
      <template #header>{{ t('subscriptions.page.listTitle') }}</template>
      <template #header-extra>
        <n-button
          v-if="sortMode === 'custom' && !batchMode"
          size="small"
          :type="showDragHandles ? 'primary' : 'default'"
          ghost
          @click="toggleDragHandles"
        >
          {{ showDragHandles ? t('subscriptions.actions.finishReorder') : t('subscriptions.actions.reorder') }}
        </n-button>
      </template>

      <n-space v-if="batchMode" justify="space-between" align="center" style="margin-bottom: 12px" wrap>
        <n-space align="center" wrap>
          <n-tag type="info">{{ t('subscriptions.page.selectedItems', { count: selectedCount }) }}</n-tag>
          <n-button size="small" :disabled="visibleSelectionIds.length === 0 || allVisibleSubscriptionsSelected" @click="selectVisibleSubscriptions">
            {{ t('subscriptions.page.selectCurrentPage') }}
          </n-button>
          <n-button size="small" :disabled="selectedCount === 0" @click="clearSelectedSubscriptions">
            {{ t('subscriptions.page.clearSelection') }}
          </n-button>
        </n-space>
        <n-space wrap>
          <n-button size="small" type="primary" ghost :disabled="selectedCount === 0" @click="runBatchRenew">
            {{ t('subscriptions.actions.batchRenew') }}
          </n-button>
          <n-button size="small" :disabled="selectedCount === 0" @click="runBatchSetStatus('active')">
            {{ t('subscriptions.actions.setActive') }}
          </n-button>
          <n-button size="small" :disabled="selectedCount === 0" @click="runBatchSetStatus('paused')">
            {{ t('subscriptions.actions.setPaused') }}
          </n-button>
          <n-button size="small" type="warning" ghost :disabled="selectedCount === 0" @click="runBatchSetStatus('cancelled')">
            {{ t('subscriptions.actions.setCancelled') }}
          </n-button>
          <n-button size="small" type="error" ghost :disabled="!canBatchDelete" @click="runBatchDelete">
            {{ t('subscriptions.actions.batchDelete') }}
          </n-button>
        </n-space>
      </n-space>

      <div v-if="isMobile" class="mobile-list">
        <n-empty v-if="orderedSubscriptions.length === 0" :description="t('subscriptions.page.noSubscriptions')" />

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
                  {{ item.currency }} {{ Number(item.amount).toFixed(2) }} ·
                  {{ formatInterval(item.billingIntervalCount, unitLabel(item.billingIntervalUnit)) }}
                </div>
              </div>
            </div>

            <n-tag :type="statusTagType(item.status)">{{ statusText(item.status) }}</n-tag>
          </div>

          <n-space wrap size="small" style="margin: 10px 0 6px">
            <n-tag
              v-for="tag in getTagDisplay(item.tags).visible"
              :key="tag.id"
              size="small"
              :bordered="false"
              :color="{ color: tag.color, textColor: '#fff' }"
            >
              {{ tag.name }}
            </n-tag>
            <n-tooltip v-if="getTagDisplay(item.tags).overflowCount > 0" trigger="hover">
              <template #trigger>
                <n-tag size="small" :bordered="false">+{{ getTagDisplay(item.tags).overflowCount }}</n-tag>
              </template>
              <span>{{ formatTagOverflowTooltip(getTagDisplay(item.tags).overflow) }}</span>
            </n-tooltip>
            <span v-if="!(item.tags?.length)" class="muted-text">{{ t('common.empty.noTags') }}</span>
          </n-space>

          <div class="mobile-subscription-card__rows">
            <div class="mobile-subscription-card__row">
              <span>{{ t('common.labels.nextRenewal') }}</span>
              <span>{{ formatDate(item.nextRenewalDate) }}</span>
            </div>
            <div class="mobile-subscription-card__row">
              <span>{{ t('common.labels.autoRenew') }}</span>
              <span>{{ item.autoRenew ? t('common.status.enabled') : t('common.status.disabled') }}</span>
            </div>
          </div>

          <div v-if="item.notes?.trim()" class="note-strip">
            <n-icon :size="14"><document-text-outline /></n-icon>
            <span class="note-strip__label">{{ t('subscriptions.labels.note') }}</span>
            <span class="note-strip__content">{{ item.notes.trim() }}</span>
          </div>

          <n-space v-if="!batchMode" wrap style="margin-top: 12px">
            <n-button size="small" @click="openDetail(item.id)">{{ t('subscriptions.actions.detail') }}</n-button>
            <n-button size="small" @click="openRecords(item.id)">{{ t('subscriptions.actions.records') }}</n-button>
            <n-button size="small" @click="openEdit(item)">{{ t('subscriptions.actions.edit') }}</n-button>
            <n-button
              v-if="item.status === 'active' || item.status === 'expired'"
              size="small"
              type="primary"
              ghost
              @click="quickRenew(item)"
            >
              {{ t('subscriptions.actions.renew') }}
            </n-button>
            <template v-if="item.status === 'active'">
              <n-popconfirm :positive-text="t('common.actions.confirm')" :negative-text="t('subscriptions.actions.cancel')" @positive-click="pause(item.id)">
                <template #trigger>
                  <n-button size="small">{{ t('subscriptions.actions.pause') }}</n-button>
                </template>
                {{ t('subscriptions.confirm.pause') }}
              </n-popconfirm>
              <n-popconfirm :positive-text="t('common.actions.confirm')" :negative-text="t('subscriptions.actions.cancel')" @positive-click="cancel(item.id)">
                <template #trigger>
                  <n-button size="small" type="error" ghost>{{ t('subscriptions.actions.cancel') }}</n-button>
                </template>
                {{ t('subscriptions.confirm.cancel') }}
              </n-popconfirm>
            </template>
            <n-popconfirm
              v-else-if="item.status === 'paused'"
              :positive-text="t('subscriptions.actions.resume')"
              :negative-text="t('subscriptions.actions.cancel')"
              @positive-click="resume(item.id)"
            >
              <template #trigger>
                <n-button size="small" type="primary" ghost>{{ t('subscriptions.actions.resume') }}</n-button>
              </template>
              {{ t('subscriptions.confirm.resume') }}
            </n-popconfirm>
            <n-popconfirm
              v-if="item.status === 'paused' || item.status === 'cancelled' || item.status === 'expired'"
              :positive-text="t('common.actions.delete')"
              :negative-text="t('common.actions.keep')"
              @positive-click="removeSubscription(item.id, item.name)"
            >
              <template #trigger>
                <n-button size="small" type="error" ghost>{{ t('common.actions.delete') }}</n-button>
              </template>
              {{ t('subscriptions.confirm.delete', { name: item.name }) }}
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
  NTooltip
} from 'naive-ui'
import {
  AddCircleOutline,
  DocumentTextOutline,
  LayersOutline,
  PricetagsOutline,
  ReorderThreeOutline,
  SearchOutline
} from '@vicons/ionicons5'
import { t } from '@/locales'
import { api } from '@/composables/api'
import { useExchangeRateSnapshotQuery } from '@/composables/exchange-rate-query'
import { useSettingsQuery } from '@/composables/settings-query'
import { TAGS_QUERY_KEY, useTagsQuery } from '@/composables/tags-query'
import TagManageModal from '@/components/TagManageModal.vue'
import PageHeader from '@/components/PageHeader.vue'
import SubscriptionDetailDrawer from '@/components/SubscriptionDetailDrawer.vue'
import SubscriptionFormModal from '@/components/SubscriptionFormModal.vue'
import SubscriptionPaymentRecordsDrawer from '@/components/SubscriptionPaymentRecordsDrawer.vue'
import type { PaymentRecord, Subscription, SubscriptionDetail, Tag } from '@/types/api'
import { resolveLogoUrl } from '@/utils/logo'
import { createSingleFlight } from '@/utils/single-flight'
import { formatSubscriptionTagOverflowTooltip, splitSubscriptionTagsForDisplay } from '@/utils/subscription-tags'
import { formatDateInTimezone } from '@/utils/timezone'
import {
  areAllVisibleSubscriptionsSelected,
  countBatchDeletableSubscriptions,
  getBatchStatusText,
  getVisiblePageSubscriptionIds,
  mergeSelectedSubscriptionIds,
  type BatchSettableStatus
} from '@/utils/subscription-batch'
import {
  DEFAULT_SUBSCRIPTION_PAGE_SIZE,
  SUBSCRIPTION_PAGE_SIZE_OPTIONS,
  getStoredSubscriptionPageSize,
  setStoredSubscriptionPageSize
} from '@/utils/subscription-pagination'
import { buildSubscriptionTableRows, paginateSubscriptions, type SubscriptionTableRow } from '@/utils/subscription-table'
import { useLocalizedMessage } from '@/utils/localized-message'

type SortMode = 'custom' | 'renewal' | 'amount-desc' | 'name'

const message = useLocalizedMessage()
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

const statusOptions = computed(() => [
  { label: t('subscriptions.status.active'), value: 'active' },
  { label: t('subscriptions.status.paused'), value: 'paused' },
  { label: t('subscriptions.status.cancelled'), value: 'cancelled' },
  { label: t('subscriptions.status.expired'), value: 'expired' }
])

const sortOptions = computed(() => [
  { label: t('subscriptions.sort.custom'), value: 'custom' },
  { label: t('subscriptions.sort.renewal'), value: 'renewal' },
  { label: t('subscriptions.sort.amountDesc'), value: 'amount-desc' },
  { label: t('subscriptions.sort.name'), value: 'name' }
])

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
const batchDeleteSummary = computed(() => countBatchDeletableSubscriptions(selectedSubscriptions.value))
const canBatchDelete = computed(() => batchDeleteSummary.value.deletableCount > 0)
const visibleSelectionIds = computed(() =>
  getVisiblePageSubscriptionIds({
    isMobile: isMobile.value,
    orderedSubscriptions: orderedSubscriptions.value,
    pagedSubscriptions: pagedSubscriptions.value
  })
)
const allVisibleSubscriptionsSelected = computed(() =>
  areAllVisibleSubscriptionsSelected(visibleSelectionIds.value, selectedSubscriptionIds.value)
)
const subscriptionQueryParams = computed(() => ({
  q: appliedFilters.q || undefined,
  status: appliedFilters.status || undefined,
  tagIds: appliedFilters.tagIds.length ? appliedFilters.tagIds.join(',') : undefined
}))
const subscriptionsQuery = useQuery({
  queryKey: computed(() => ['subscriptions', subscriptionQueryParams.value]),
  queryFn: () => api.getSubscriptions(subscriptionQueryParams.value),
  staleTime: 5_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false
})

const orderedSubscriptions = computed(() => {
  const rows = [...subscriptions.value]

  switch (sortMode.value) {
    case 'renewal':
      return rows.sort(
        (a, b) =>
          formatDate(a.nextRenewalDate).localeCompare(formatDate(b.nextRenewalDate), 'zh-CN') ||
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
        title: canDragReorder.value ? t('subscriptions.page.dragHandleEnabledTitle') : t('subscriptions.page.dragHandleDisabledTitle'),
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
  border: '1px solid var(--app-border-soft)',
  background: 'var(--app-surface)',
  flexShrink: '0'
}

const logoFallbackStyle = {
  width: '28px',
  height: '28px',
  borderRadius: '8px',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
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
  background: 'var(--app-surface)',
  border: '1px solid var(--app-border-soft)',
  borderRadius: '6px',
  color: 'var(--app-text-primary)',
  fontSize: '12px'
} as const

const noteLabelStyle = {
  fontWeight: '600',
  color: 'var(--app-text-secondary)',
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
  color: 'var(--app-text-strong)'
}

const tagListStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px'
}

<<<<<<< HEAD
function getTagDisplay(tags?: Tag[] | null) {
  return splitSubscriptionTagsForDisplay(tags)
}

function formatTagOverflowTooltip(tags: Tag[]) {
  return formatSubscriptionTagOverflowTooltip(tags)
}

const mainColumns = [
=======
const mainColumns = computed(() => [
>>>>>>> 48ca025 (feat: add web i18n with shared messages)
  {
    title: t('common.labels.name'),
    key: 'name',
    colSpan: (row: SubscriptionTableRow) =>
      row.__rowType === 'note' ? (batchMode.value ? 8 : dragHandleVisible.value ? 8 : 7) : 1,
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') {
        return h('div', { style: noteContainerStyle }, [
          h(NIcon, { size: 14 }, { default: () => h(DocumentTextOutline) }),
          h('span', { style: noteLabelStyle }, t('subscriptions.labels.note')),
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
    title: t('common.labels.tags'),
    key: 'tags',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') return null
      if (!(row.tags?.length)) return t('common.empty.noTags')

      const { visible, overflow, overflowCount } = splitSubscriptionTagsForDisplay(row.tags)

      return h(
        'div',
        { style: tagListStyle },
        [
          ...visible.map((tag) =>
            h(
              NTag,
              {
                size: 'small',
                bordered: false,
                color: { color: tag.color, textColor: '#fff' }
              },
              { default: () => tag.name }
            )
          ),
          overflowCount > 0
            ? h(
                NTooltip,
                { trigger: 'hover' },
                {
                  trigger: () =>
                    h(
                      NTag,
                      {
                        size: 'small',
                        bordered: false
                      },
                      { default: () => `+${overflowCount}` }
                    ),
                  default: () => formatSubscriptionTagOverflowTooltip(overflow)
                }
              )
            : null
        ].filter(Boolean)
      )
    }
  },
  {
    title: t('common.labels.amount'),
    key: 'amount',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? null : `${row.currency} ${Number(row.amount).toFixed(2)}`)
  },
  {
    title: t('subscriptions.labels.interval'),
    key: 'interval',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? null : formatInterval(row.billingIntervalCount, unitLabel(row.billingIntervalUnit)))
  },
  {
    title: t('common.labels.nextRenewal'),
    key: 'nextRenewalDate',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? null : formatDate(row.nextRenewalDate))
  },
  {
    title: t('common.labels.status'),
    key: 'status',
    colSpan: (row: SubscriptionTableRow) => (row.__rowType === 'note' ? 0 : 1),
    render: (row: SubscriptionTableRow) =>
      row.__rowType === 'note' ? null : h(NTag, { type: statusTagType(row.status) }, { default: () => statusText(row.status) })
  },
  {
    title: t('common.labels.actions'),
    key: 'actions',
    render: (row: SubscriptionTableRow) => {
      if (row.__rowType === 'note') return null

      const statusActions =
        row.status === 'active'
          ? [
              h(
                NPopconfirm,
                { positiveText: t('common.actions.confirm'), negativeText: t('subscriptions.actions.cancel'), onPositiveClick: () => void pause(row.id) },
                {
                  trigger: () => h(NButton, { size: 'small' }, { default: () => t('subscriptions.actions.pause') }),
                  default: () => t('subscriptions.confirm.pause')
                }
              ),
              h(
                NPopconfirm,
                { positiveText: t('common.actions.confirm'), negativeText: t('subscriptions.actions.cancel'), onPositiveClick: () => void cancel(row.id) },
                {
                  trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => t('subscriptions.actions.cancel') }),
                  default: () => t('subscriptions.confirm.cancel')
                }
              )
            ]
          : row.status === 'paused'
            ? [
                h(
                  NPopconfirm,
                  { positiveText: t('subscriptions.actions.resume'), negativeText: t('subscriptions.actions.cancel'), onPositiveClick: () => void resume(row.id) },
                  {
                    trigger: () => h(NButton, { size: 'small', type: 'primary', ghost: true }, { default: () => t('subscriptions.actions.resume') }),
                    default: () => t('subscriptions.confirm.resume')
                  }
                ),
                h(
                  NPopconfirm,
                  { positiveText: t('common.actions.delete'), negativeText: t('common.actions.keep'), onPositiveClick: () => void removeSubscription(row.id, row.name) },
                  {
                    trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => t('common.actions.delete') }),
                    default: () => t('subscriptions.confirm.delete', { name: row.name })
                  }
                )
              ]
            : [
                h(
                  NPopconfirm,
                  { positiveText: t('common.actions.delete'), negativeText: t('common.actions.keep'), onPositiveClick: () => void removeSubscription(row.id, row.name) },
                  {
                    trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => t('common.actions.delete') }),
                    default: () => t('subscriptions.confirm.delete', { name: row.name })
                  }
                )
              ]

      return h(NSpace, { size: 6, wrapItem: false }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => void openDetail(row.id) }, { default: () => t('subscriptions.actions.detail') }),
          h(NButton, { size: 'small', onClick: () => void openRecords(row.id) }, { default: () => t('subscriptions.actions.records') }),
          h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => t('subscriptions.actions.edit') }),
          ...(row.status === 'active' || row.status === 'expired'
            ? [h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => void quickRenew(row) }, { default: () => t('subscriptions.actions.renew') })]
            : []),
          ...statusActions
        ]
      })
    }
  }
])

const columns = computed(() => {
  const result = [...mainColumns.value]
  if (batchMode.value) {
    return [selectionColumn, ...result]
  }
  if (dragHandleVisible.value) {
    return [dragColumn, ...result]
  }
  return result
})
const tableRows = computed<SubscriptionTableRow[]>(() => buildSubscriptionTableRows(pagedSubscriptions.value))

onMounted(async () => {
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

async function refetchCurrentSubscriptions() {
  await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
  await subscriptionsQuery.refetch()
}

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
  editing.value = null
}

const submitSubscriptionTask = createSingleFlight(async (payload: Record<string, unknown>, editingId?: string) => {
  savingSubscription.value = true
  try {
    if (editingId) {
      await api.updateSubscription(editingId, payload)
      message.success(t('subscriptions.messages.subscriptionUpdated'))
    } else {
      await api.createSubscription(payload)
      message.success(t('subscriptions.messages.subscriptionCreated'))
    }

    closeModal()
    await refetchCurrentSubscriptions()
  } catch (error) {
    message.error(
      t('subscriptions.messages.subscriptionSaveFailed', {
        message: error instanceof Error ? error.message : t('common.errors.requestFailed')
      })
    )
  } finally {
    savingSubscription.value = false
  }
})

function submitSubscription(payload: Record<string, unknown>, editingId?: string) {
  return submitSubscriptionTask.run(payload, editingId)
}

async function createTag(payload: { name: string; color: string; sortOrder: number }) {
  try {
    await api.createTag(payload)
    message.success(t('subscriptions.messages.tagCreated'))
    await Promise.all([queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }), refetchCurrentSubscriptions()])
  } catch (error) {
    message.error(
      t('subscriptions.messages.tagCreateFailed', {
        message: error instanceof Error ? error.message : t('common.errors.requestFailed')
      })
    )
  }
}

async function updateTag(payload: { name: string; color: string; sortOrder: number }, id: string) {
  try {
    await api.updateTag(id, payload)
    message.success(t('subscriptions.messages.tagUpdated'))
    await Promise.all([queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }), refetchCurrentSubscriptions()])
  } catch (error) {
    message.error(
      t('subscriptions.messages.tagUpdateFailed', {
        message: error instanceof Error ? error.message : t('common.errors.requestFailed')
      })
    )
  }
}

async function deleteTag(tag: Tag) {
  try {
    await api.deleteTag(tag.id)
    message.success(t('subscriptions.messages.tagDeleted', { name: tag.name }))
    filters.tagIds = filters.tagIds.filter((item) => item !== tag.id)
    await Promise.all([queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }), refetchCurrentSubscriptions()])
  } catch (error) {
    message.error(
      t('subscriptions.messages.tagDeleteFailed', {
        message: error instanceof Error ? error.message : t('common.errors.requestFailed')
      })
    )
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

function selectVisibleSubscriptions() {
  selectedSubscriptionIds.value = mergeSelectedSubscriptionIds(selectedSubscriptionIds.value, visibleSelectionIds.value)
}

function ensureBatchSelection() {
  if (!selectedCount.value) {
    message.warning(t('subscriptions.batch.selectFirst'))
    return false
  }
  return true
}

function summarizeBatchResult(label: string, result: { successCount: number; failureCount: number }) {
  if (result.failureCount === 0) {
    message.success(t('subscriptions.messages.batchActionSuccess', { label, count: result.successCount }))
    return
  }

  message.warning(t('subscriptions.messages.batchActionPartial', { label, success: result.successCount, failure: result.failureCount }))
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
  summarizeBatchResult(t('subscriptions.actions.batchRenew'), result)
  await refetchCurrentSubscriptions()
  await refreshOpenDetailIfNeeded(ids)
}

async function runBatchSetStatus(status: BatchSettableStatus) {
  if (!ensureBatchSelection()) return
  const statusLabel = getBatchStatusText(status)
  if (!window.confirm(t('subscriptions.batch.statusConfirm', { count: selectedCount.value, status: statusLabel }))) return
  const ids = [...selectedSubscriptionIds.value]
  const result = await api.batchUpdateSubscriptionStatus(ids, status)
  const actionLabel =
    status === 'active'
      ? t('subscriptions.actions.setActive')
      : status === 'paused'
        ? t('subscriptions.actions.setPaused')
        : t('subscriptions.actions.setCancelled')
  summarizeBatchResult(actionLabel, result)
  await refetchCurrentSubscriptions()
  await refreshOpenDetailIfNeeded(ids)
}

async function runBatchDelete() {
  if (!ensureBatchSelection() || !canBatchDelete.value) return
  const { deletableCount, blockedCount } = batchDeleteSummary.value
  const confirmMessage =
    blockedCount > 0
      ? t('subscriptions.batch.deleteConfirmPartial', { deletable: deletableCount, blocked: blockedCount })
      : t('subscriptions.batch.deleteConfirmAll', { count: deletableCount })
  if (!window.confirm(confirmMessage)) return
  const ids = [...selectedSubscriptionIds.value]
  const result = await api.batchDeleteSubscriptions(ids)
  const skippedActiveCount = result.failures.filter((item) => item.message === 'api.errors.subscriptions.activeDeleteBlocked').length
  const otherFailureCount = result.failureCount - skippedActiveCount
  if (result.failureCount === 0) {
    message.success(t('subscriptions.messages.batchDeleteSuccess', { count: result.successCount }))
  } else {
    message.warning(
      t('subscriptions.messages.batchDeletePartial', {
        success: result.successCount,
        skipped: skippedActiveCount,
        failure: otherFailureCount
      })
    )
  }
  const deletedIds = ids.filter((id) => !result.failures.some((failure) => failure.id === id))
  if (detail.value && deletedIds.includes(detail.value.id)) {
    detail.value = null
    showDetailDrawer.value = false
  }
  clearSelectedSubscriptions()
  await refetchCurrentSubscriptions()
}

async function quickRenew(row: Subscription) {
  await api.renewSubscription(row.id)
  message.success(t('subscriptions.messages.renewed', { name: row.name }))
  await refetchCurrentSubscriptions()
  if (detail.value?.id === row.id) {
    detail.value = await api.getSubscription(row.id)
  }
}

async function pause(id: string) {
  await api.pauseSubscription(id)
  message.success(t('subscriptions.messages.paused'))
  await refetchCurrentSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function resume(id: string) {
  await api.updateSubscription(id, { status: 'active' })
  message.success(t('subscriptions.messages.resumed'))
  await refetchCurrentSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function cancel(id: string) {
  await api.cancelSubscription(id)
  message.success(t('subscriptions.messages.cancelled'))
  await refetchCurrentSubscriptions()
  if (detail.value?.id === id) {
    detail.value = await api.getSubscription(id)
  }
}

async function removeSubscription(id: string, name: string) {
  await api.deleteSubscription(id)
  message.success(t('subscriptions.messages.deleted', { name }))
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
    message.success(t('subscriptions.messages.orderUpdated'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('subscriptions.messages.orderUpdateFailed'))
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
    message.info(t('subscriptions.messages.dragSortEnabled'))
  }
}

function statusText(status: Subscription['status']) {
  return {
    active: t('subscriptions.status.active'),
    paused: t('subscriptions.status.paused'),
    cancelled: t('subscriptions.status.cancelled'),
    expired: t('subscriptions.status.expired')
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
  return formatDateInTimezone(value, settings.value?.timezone)
}

function formatInterval(count: number, unit: string) {
  return t('subscriptions.values.interval', { count, unit })
}

function unitLabel(unit: string) {
  return {
    day: t('common.units.day'),
    week: t('common.units.week'),
    month: t('common.units.month'),
    quarter: t('common.units.quarter'),
    year: t('common.units.year')
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
  color: var(--app-text-strong);
}

.mobile-subscription-card__meta {
  color: var(--app-text-secondary);
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
  color: var(--app-text-primary);
}

.subscription-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: contain;
  border: 1px solid var(--app-border-soft);
  background: var(--app-surface);
}

.subscription-logo--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-weight: 700;
}

.note-strip {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--app-surface);
  border: 1px solid var(--app-border-soft);
  border-radius: 6px;
  color: var(--app-text-primary);
  font-size: 12px;
  margin-top: 12px;
}

.note-strip__label {
  font-weight: 600;
  color: var(--app-text-secondary);
  flex-shrink: 0;
}

.note-strip__content {
  min-width: 0;
  word-break: break-all;
  line-height: 1.5;
}

.muted-text {
  color: var(--app-text-muted);
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
  background: var(--app-accent-soft);
}

.drag-handle-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--app-text-secondary);
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
