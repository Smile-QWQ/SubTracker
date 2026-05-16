<template>
  <div>
    <page-header title="仪表盘" subtitle="总览订阅规模、预算使用、待续订与支出分布" :icon="gridOutline" />

    <n-grid :cols="24" :x-gap="12" :y-gap="12">
      <n-grid-item v-for="item in summaryCards" :key="item.label" :span="summarySpan">
        <stat-card :label="item.label" :value="item.value" :icon="item.icon" />
      </n-grid-item>

      <n-grid-item :span="halfSpan">
        <n-card title="月预算使用">
          <template v-if="overview?.budgetSummary.monthly.budget">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatBudgetPercentage(overview.budgetSummary.monthly.ratio)"
                :status="budgetProgressStatus(overview.budgetSummary.monthly.status)"
                :show-indicator="false"
              />
              <span class="budget-progress-value" :class="progressValueClass(overview.budgetSummary.monthly.status)">
                {{ formatBudgetPercentage(overview.budgetSummary.monthly.ratio) }}%
              </span>
            </div>
            <div class="budget-meta">
              已使用
              <span :class="usedValueClass(overview.budgetSummary.monthly.status)">
                {{ formatMoney(overview.budgetSummary.monthly.spent, baseCurrency) }}
              </span>
              / 预算 {{ formatMoney(overview.budgetSummary.monthly.budget ?? 0, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置月预算" />
        </n-card>
      </n-grid-item>

      <n-grid-item :span="halfSpan">
        <n-card title="年预算使用">
          <template v-if="overview?.budgetSummary.yearly.budget">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatBudgetPercentage(overview.budgetSummary.yearly.ratio)"
                :status="budgetProgressStatus(overview.budgetSummary.yearly.status)"
                :show-indicator="false"
              />
              <span class="budget-progress-value" :class="progressValueClass(overview.budgetSummary.yearly.status)">
                {{ formatBudgetPercentage(overview.budgetSummary.yearly.ratio) }}%
              </span>
            </div>
            <div class="budget-meta">
              已使用
              <span :class="usedValueClass(overview.budgetSummary.yearly.status)">
                {{ formatMoney(overview.budgetSummary.yearly.spent, baseCurrency) }}
              </span>
              / 预算 {{ formatMoney(overview.budgetSummary.yearly.budget ?? 0, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置年预算" />
        </n-card>
      </n-grid-item>

    </n-grid>

    <n-card title="即将续订（30天）" style="margin-top: 12px">
      <n-data-table :columns="columns" :data="overview?.upcomingRenewals ?? []" :pagination="false" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NCard, NDataTable, NEmpty, NGrid, NGridItem, NProgress, NTag } from 'naive-ui'
import { CashOutline, GridOutline, LayersOutline, NotificationsOutline, WalletOutline } from '@vicons/ionicons5'
import { useSettingsQuery } from '@/composables/settings-query'
import { useStatisticsOverviewQuery } from '@/composables/statistics-overview-query'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { formatDateInTimezone } from '@/utils/timezone'
import type { StatisticsOverview } from '@/types/api'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'

const { width } = useWindowSize()
const gridOutline = GridOutline

const { data: overview } = useStatisticsOverviewQuery()

const { data: settings } = useSettingsQuery()

const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const summarySpan = computed(() => {
  if (width.value < 640) return 24
  if (width.value < 1100) return 12
  return 6
})
const halfSpan = computed(() => (width.value < 1100 ? 24 : 12))

const summaryCards = computed(() => [
  { label: '活跃订阅', value: overview.value?.activeSubscriptions ?? 0, icon: LayersOutline },
  { label: '7 天内续订', value: overview.value?.upcoming7Days ?? 0, icon: NotificationsOutline },
  {
    label: '本月预计支出',
    value: overview.value ? formatMoney(overview.value.monthlyEstimatedBase, baseCurrency.value) : '--',
    icon: WalletOutline
  },
  {
    label: '年度预计支出',
    value: overview.value ? formatMoney(overview.value.yearlyEstimatedBase, baseCurrency.value) : '--',
    icon: CashOutline
  }
])

const columns = [
  { title: '订阅', key: 'name' },
  {
    title: '下次续订',
    key: 'nextRenewalDate',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => formatDateInTimezone(row.nextRenewalDate, settings.value?.timezone)
  },
  {
    title: '原始金额',
    key: 'amount',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => formatMoney(row.amount, row.currency)
  },
  {
    title: '折算金额',
    key: 'convertedAmount',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => formatMoney(row.convertedAmount, baseCurrency.value)
  },
  {
    title: '状态',
    key: 'status',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) =>
      h(NTag, { type: getSubscriptionStatusTagType(row.status) }, { default: () => getSubscriptionStatusText(row.status) })
  }
]

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

function formatBudgetPercentage(ratio?: number | null) {
  const raw = (ratio ?? 0) * 100
  return Math.round(raw * 100) / 100
}

function budgetProgressStatus(status?: 'normal' | 'warning' | 'over') {
  if (status === 'over') return 'error'
  if (status === 'warning') return 'warning'
  return 'success'
}

function progressValueClass(status?: 'normal' | 'warning' | 'over') {
  return {
    'text-danger': status === 'over',
    'text-warning': status === 'warning'
  }
}

function usedValueClass(status?: 'normal' | 'warning' | 'over') {
  return {
    'budget-meta__used--over': status === 'over',
    'budget-meta__used--warning': status === 'warning'
  }
}
</script>

<style scoped>
.budget-progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.budget-progress-row :deep(.n-progress) {
  flex: 1;
}

.budget-progress-value {
  flex-shrink: 0;
  min-width: 56px;
  text-align: right;
  color: var(--app-text-primary);
  font-variant-numeric: tabular-nums;
}

.budget-meta {
  margin-top: 10px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.budget-meta__used--over {
  color: #dc2626;
  font-weight: 600;
}

.budget-meta__used--warning {
  color: #d97706;
  font-weight: 600;
}

.text-danger {
  color: #dc2626;
  font-weight: 600;
}

.text-warning {
  color: #d97706;
  font-weight: 600;
}
</style>
