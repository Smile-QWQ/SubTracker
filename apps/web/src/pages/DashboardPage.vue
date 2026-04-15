<template>
  <div>
    <page-header title="仪表盘" subtitle="总览订阅规模、预算使用、待续订与费用分布" :icon="gridOutline" />

    <n-grid :cols="24" :x-gap="12" :y-gap="12">
      <n-grid-item v-for="item in summaryCards" :key="item.label" :span="summarySpan">
        <stat-card :label="item.label" :value="item.value" :icon="item.icon" />
      </n-grid-item>

      <n-grid-item :span="halfSpan">
        <n-card title="月预算使用">
          <template v-if="overview?.monthlyBudgetBase">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatBudgetPercentage(overview.monthlyBudgetUsageRatio)"
                :show-indicator="false"
              />
              <span class="budget-progress-value">{{ formatBudgetPercentage(overview.monthlyBudgetUsageRatio) }}%</span>
            </div>
            <div class="budget-meta">
              已使用 {{ formatMoney(overview.monthlyEstimatedBase, baseCurrency) }} / 预算
              {{ formatMoney(overview.monthlyBudgetBase, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置月预算" />
        </n-card>
      </n-grid-item>

      <n-grid-item :span="halfSpan">
        <n-card title="年预算使用">
          <template v-if="overview?.yearlyBudgetBase">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatBudgetPercentage(overview.yearlyBudgetUsageRatio)"
                status="warning"
                :show-indicator="false"
              />
              <span class="budget-progress-value">{{ formatBudgetPercentage(overview.yearlyBudgetUsageRatio) }}%</span>
            </div>
            <div class="budget-meta">
              已使用 {{ formatMoney(overview.yearlyEstimatedBase, baseCurrency) }} / 预算
              {{ formatMoney(overview.yearlyBudgetBase, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置年预算" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="chartCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="标签月度支出">
          <chart-view v-if="categoryOption" :option="categoryOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="支付历史趋势">
          <chart-view v-if="trendOption" :option="trendOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-card title="即将续订（30 天）" style="margin-top: 12px">
      <n-data-table :columns="columns" :data="overview?.upcomingRenewals ?? []" :pagination="false" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, h } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useWindowSize } from '@vueuse/core'
import { NCard, NDataTable, NEmpty, NGrid, NGridItem, NProgress, NTag } from 'naive-ui'
import { CashOutline, GridOutline, LayersOutline, NotificationsOutline, WalletOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import type { StatisticsOverview } from '@/types/api'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'

const { width } = useWindowSize()
const gridOutline = GridOutline

const { data: overview } = useQuery({
  queryKey: ['statistics-overview'],
  queryFn: () => api.getStatisticsOverview()
})

const { data: settings } = useQuery({
  queryKey: ['settings'],
  queryFn: () => api.getSettings()
})

const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const summarySpan = computed(() => {
  if (width.value < 640) return 24
  if (width.value < 1100) return 12
  return 6
})
const halfSpan = computed(() => (width.value < 1100 ? 24 : 12))
const chartCols = computed(() => (width.value < 1100 ? 1 : 2))

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

const categoryOption = computed(() => {
  if (!overview.value?.tagSpend?.length) return null
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '68%'],
        data: overview.value.tagSpend
      }
    ]
  }
})

const trendOption = computed(() => {
  if (!overview.value?.monthlyTrend?.length) return null
  return {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: overview.value.monthlyTrend.map((item) => item.month)
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: overview.value.monthlyTrend.map((item) => item.amount),
        type: 'line',
        smooth: true,
        areaStyle: {}
      }
    ]
  }
})

const columns = [
  { title: '订阅', key: 'name' },
  {
    title: '下次续订',
    key: 'nextRenewalDate',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => dayjs(row.nextRenewalDate).format('YYYY-MM-DD')
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
  const raw = Math.min((ratio ?? 0) * 100, 100)
  return Math.round(raw * 100) / 100
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
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.budget-meta {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.5;
}
</style>
